import nodemailer from 'nodemailer';

import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

export const sendOTP = async (email, otp) => {
    const mailOptions = {
        from: 'raju021072003@gmail.com',
        to: email,
        subject: 'Your Verification Code',
        text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
        html: `<p>Your verification code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('OTP sent to', email);
    } catch (error) {
        console.error('Error sending OTP:', error);
        throw new Error('Failed to send OTP');
    }
};

export const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
