const nodemailer = require("nodemailer");

const MAIL_HOST = "sandbox.smtp.mailtrap.io";
const MAIL_PORT = 2525;
const MAIL_USER = process.env.MAILTRAP_USER || "eac541160f7ce6";
const MAIL_PASS = process.env.MAILTRAP_PASS || "7df088a34c939e";
const MAIL_FROM = process.env.MAIL_FROM || "no-reply@nnptud.local";

const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: false,
    auth: {
        user: MAIL_USER,
        pass: MAIL_PASS,
    },
});

module.exports = {
    sendMail: async function (to, url) {
        const info = await transporter.sendMail({
            from: MAIL_FROM,
            to: to,
            subject: "Reset Password email",
            text: "Click vao duong dan de reset password: " + url,
            html: "Click vao <a href=\"" + url + "\">day</a> de reset password",
        });
        return info;
    }
}
