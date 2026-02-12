// utils/email.js
import nodemailer from "nodemailer";

export const sendEmail = async ({ to, subject, html, text }) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 465, // 587
    secure: true, // true for 465
    auth: {
      user: "noreply@gxinetworks.com",
      pass: "August@082024",
    },
  });

  const from = `CabTalk hariomtri27@gmail.com`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};