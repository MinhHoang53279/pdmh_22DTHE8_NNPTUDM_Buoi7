var express = require('express');
var router = express.Router();
let userController = require('../controllers/users')
let bcrypt = require('bcrypt')
let jwt = require('jsonwebtoken')
let { checkLogin } = require('../utils/authHandler')
let crypto = require('crypto')
let { sendMail } = require('../utils/mailHandler')

async function changePasswordHandler(req, res, next) {
  try {
    let oldPassword = req.body.oldpassword || req.body.oldPassword;
    let newPassword = req.body.newpassword || req.body.newPassword;

    if (!oldPassword || !newPassword) {
      res.status(400).send({
        message: 'oldPassword va newPassword khong duoc de trong'
      })
      return;
    }

    let user = await userController.FindByID(req.userId);
    if (!user) {
      res.status(404).send({
        message: 'nguoi dung khong ton tai'
      })
      return;
    }

    let isOldPasswordCorrect = bcrypt.compareSync(oldPassword, user.password);
    if (!isOldPasswordCorrect) {
      res.status(400).send({
        message: 'oldPassword khong dung'
      })
      return;
    }

    let isSamePassword = bcrypt.compareSync(newPassword, user.password);
    if (isSamePassword) {
      res.status(400).send({
        message: 'newPassword phai khac oldPassword'
      })
      return;
    }

    user.password = newPassword;
    await user.save();

    res.send({
      message: 'da cap nhat password'
    })
  } catch (error) {
    res.status(400).send({
      message: error.message
    })
  }
}


router.post('/register', async function (req, res, next) {
  let newUser = await userController.CreateAnUser(
    req.body.username,
    req.body.password,
    req.body.email,
    '69a4f929f8d941f2dd234b88'
  )
  res.send(newUser)
});
router.post('/login', async function (req, res, next) {
  let { username, password } = req.body;
  let getUser = await userController.FindByUsername(username);
  if (!getUser) {
    res.status(404).send({
      message: "username khong ton tai hoac thong tin dang nhap sai"
    })
    return;
  }
  let result = bcrypt.compareSync(password, getUser.password);
  if (result) {
    let token = jwt.sign({
      id: getUser._id,
      exp: Date.now() + 3600 * 1000
    }, "HUTECH")
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 60 * 60 * 1000
    });
    res.send(token)
  } else {
    res.status(404).send({
      message: "username khong ton tai hoac thong tin dang nhap sai"
    })
  }
});
//localhost:3000
router.get('/me', checkLogin, async function (req, res, next) {
  let user = await userController.FindByID(req.userId);
  res.send(user)
});
router.post('/logout', checkLogin, function (req, res, next) {
  res.cookie('token', null, {
    maxAge: 0,
    httpOnly: true
  })
  res.send("logout")
})
router.post('/changepassword', checkLogin, changePasswordHandler)
router.post('/change-password', checkLogin, changePasswordHandler)

router.post('/forgotpassword', async function (req, res, next) {
  try {
    let email = req.body.email;
    if (!email) {
      res.status(400).send({
        message: 'email khong duoc de trong'
      })
      return;
    }

    let user = await userController.FindByEmail(email);
    if (!user) {
      res.status(404).send({
        message: 'email khong ton tai'
      })
      return;
    }

    user.forgotPasswordToken = crypto.randomBytes(31).toString('hex');
    user.forgotPasswordTokenExp = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    let resetPasswordUrl = req.protocol + "://" + req.get('host') + "/auth/resetpassword/" + user.forgotPasswordToken;
    await sendMail(user.email, resetPasswordUrl)

    res.send({
      message: 'gui mail reset pass thanh cong'
    })
  } catch (error) {
    res.status(400).send({
      message: error.message
    })
  }
})

router.post('/resetpassword/:token', async function (req, res, next) {
  try {
    let token = req.params.token;
    let newPassword = req.body.password || req.body.newPassword;
    if (!newPassword) {
      res.status(400).send({
        message: 'password moi khong duoc de trong'
      })
      return;
    }

    let getUser = await userController.FindByToken(token);
    if (!getUser) {
      res.status(400).send({
        message: 'loi token'
      })
      return;
    }

    getUser.password = newPassword;
    getUser.forgotPasswordToken = '';
    getUser.forgotPasswordTokenExp = null;
    await getUser.save()
    res.send({
      message: 'da cap nhat password'
    })
  } catch (error) {
    res.status(400).send({
      message: error.message
    })
  }
})


module.exports = router;


//mongodb
