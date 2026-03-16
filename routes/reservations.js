var express = require("express");
var router = express.Router();
let mongoose = require('mongoose')
let { checkLogin } = require('../utils/authHandler')
let reservationModel = require('../schemas/reservations')
let cartModel = require('../schemas/carts')
let inventoryModel = require('../schemas/inventories')

function makeError(message, status) {
    let error = new Error(message);
    error.status = status;
    return error;
}

function normalizeReserveItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw makeError('danh sach san pham khong hop le', 400);
    }
    let mergedItems = {};
    for (let item of rawItems) {
        if (!item || !item.product) {
            throw makeError('san pham khong hop le', 400);
        }
        if (!mongoose.Types.ObjectId.isValid(item.product)) {
            throw makeError('id san pham khong hop le', 400);
        }
        let quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw makeError('so luong phai la so nguyen duong', 400);
        }

        let key = String(item.product);
        if (!mergedItems[key]) {
            mergedItems[key] = {
                product: item.product,
                quantity: 0
            }
        }
        mergedItems[key].quantity += quantity;
    }

    return Object.values(mergedItems);
}

function getReserveItemsFromBody(body) {
    if (Array.isArray(body)) {
        return body;
    }
    if (Array.isArray(body.items)) {
        return body.items;
    }
    if (Array.isArray(body.products)) {
        return body.products;
    }
    if (Array.isArray(body.list)) {
        return body.list;
    }
    if (body.product) {
        return [body];
    }
    return [];
}

async function createReservationFromItems(userId, rawItems, session) {
    let normalizedItems = normalizeReserveItems(rawItems);
    let reservationItems = [];
    let amount = 0;

    for (let currentItem of normalizedItems) {
        let inventory = await inventoryModel.findOne({
            product: currentItem.product
        }).populate({
            path: 'product',
            select: 'title price'
        }).session(session);

        if (!inventory || !inventory.product) {
            throw makeError('san pham khong ton tai trong kho', 404);
        }

        let available = inventory.stock - inventory.reserved;
        if (available < currentItem.quantity) {
            throw makeError('san pham ' + inventory.product.title + ' khong du so luong', 400);
        }

        inventory.reserved += currentItem.quantity;
        await inventory.save({ session });

        let price = Number(inventory.product.price || 0);
        let subtotal = price * currentItem.quantity;
        amount += subtotal;

        reservationItems.push({
            product: inventory.product._id,
            quantity: currentItem.quantity,
            title: inventory.product.title,
            price: price,
            subtotal: subtotal
        })
    }

    let reservation = new reservationModel({
        user: userId,
        items: reservationItems,
        amount: amount,
        expiredIn: new Date(Date.now() + 10 * 60 * 1000)
    })
    await reservation.save({ session });
    return reservation;
}

router.get('/reservations', checkLogin, async function (req, res, next) {
    let reservations = await reservationModel.find({
        user: req.userId
    }).sort({
        _id: -1
    });
    res.send(reservations)
})

router.get('/reservations/:id', checkLogin, async function (req, res, next) {
    try {
        let reservation = await reservationModel.findOne({
            _id: req.params.id,
            user: req.userId
        });

        if (!reservation) {
            res.status(404).send({
                message: 'reservation khong ton tai'
            })
            return;
        }

        res.send(reservation)
    } catch (error) {
        res.status(404).send({
            message: 'reservation khong ton tai'
        })
    }
})

router.post('/reserveACart', checkLogin, async function (req, res, next) {
    let session = await mongoose.startSession();
    session.startTransaction();
    try {
        let currentCart = await cartModel.findOne({
            user: req.userId
        }).session(session);

        if (!currentCart || currentCart.cartItems.length === 0) {
            throw makeError('gio hang rong', 400);
        }

        let reservation = await createReservationFromItems(req.userId, currentCart.cartItems, session);

        currentCart.cartItems = [];
        await currentCart.save({ session });

        await session.commitTransaction();

        let result = await reservationModel.findById(reservation._id);
        res.send(result)
    } catch (error) {
        await session.abortTransaction();
        res.status(error.status || 400).send({
            message: error.message
        })
    } finally {
        session.endSession();
    }
})

router.post('/reserveItems', checkLogin, async function (req, res, next) {
    let session = await mongoose.startSession();
    session.startTransaction();
    try {
        let rawItems = getReserveItemsFromBody(req.body);
        let reservation = await createReservationFromItems(req.userId, rawItems, session);

        await session.commitTransaction();

        let result = await reservationModel.findById(reservation._id);
        res.send(result)
    } catch (error) {
        await session.abortTransaction();
        res.status(error.status || 400).send({
            message: error.message
        })
    } finally {
        session.endSession();
    }
})

router.post('/cancelReserve/:id', checkLogin, async function (req, res, next) {
    let session = await mongoose.startSession();
    session.startTransaction();
    try {
        let reservation = await reservationModel.findOne({
            _id: req.params.id,
            user: req.userId
        }).session(session);

        if (!reservation) {
            throw makeError('reservation khong ton tai', 404);
        }

        if (reservation.status !== 'actived') {
            throw makeError('chi huy duoc reservation dang actived', 400);
        }

        for (let currentItem of reservation.items) {
            let inventory = await inventoryModel.findOne({
                product: currentItem.product
            }).session(session);

            if (!inventory) {
                throw makeError('san pham trong kho khong ton tai', 404);
            }

            let nextReserved = inventory.reserved - currentItem.quantity;
            inventory.reserved = nextReserved > 0 ? nextReserved : 0;
            await inventory.save({ session });
        }

        reservation.status = 'cancelled';
        await reservation.save({ session });

        await session.commitTransaction();
        res.send(reservation)
    } catch (error) {
        await session.abortTransaction();
        res.status(error.status || 400).send({
            message: error.message
        })
    } finally {
        session.endSession();
    }
})

module.exports = router;
