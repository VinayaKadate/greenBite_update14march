// 2nd  
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Create transporter with updated configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'ajaysinggoutam@gmail.com',
    pass: 'fqlk vqaq gbiy euby'
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true,
  logger: true
});

// Verify connection immediately
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('Server ready to send emails');
  }
});

// Update the NGO approval endpoint
app.post('/api/send-approval-email', async (req, res) => {
  console.log('Received approval request:', req.body);
  
  try {
    const { email, ngoName } = req.body;

    if (!email || !ngoName) {
      console.log('Missing required fields:', { email, ngoName });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const mailOptions = {
      from: {
        name: 'GreenBite Admin',
        address: 'ajaysinggoutam@gmail.com'
      },
      to: email,
      subject: 'NGO Account Approved - GreenBite',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5282;">NGO Account Approved</h2>
          <p>Dear ${ngoName},</p>
          <p>Congratulations! Your NGO account has been approved on GreenBite.</p>
          <p>You can now log in to your account and start managing donations.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    
    return res.status(200).json({
      success: true,
      messageId: info.messageId
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add the expiry notification endpoint
app.post('/api/send-expiry-notification', async (req, res) => {
  console.log('Received expiry notification request:', req.body);
  
  try {
    const { to, items } = req.body;

    if (!to || !items) {
      console.log('Missing required fields:', { to, items });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const mailOptions = {
      from: {
        name: 'GreenBite Notification',
        address: 'ajaysinggoutam@gmail.com'
      },
      to: to,
      subject: 'Food Items Expiring Soon - GreenBite Alert',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2c5282;">Food Items Expiring Soon</h2>
          <p>Hello,</p>
          <p>The following items in your inventory are expiring soon:</p>
          <ul style="list-style: none; padding: 0;">
            ${items.map(item => `
              <li style="margin-bottom: 10px; padding: 10px; background-color: ${
                item.daysLeft < 0 ? '#FED7D7' : '#FAF089'
              }; border-radius: 4px;">
                <strong>${item.name}</strong><br>
                Expires: ${item.expiryDate}<br>
                ${item.daysLeft < 0 
                  ? '<span style="color: #C53030;">Already Expired!</span>' 
                  : `<span style="color: #744210;">Expires in ${item.daysLeft} days</span>`
                }
              </li>
            `).join('')}
          </ul>
          <p>Please check these items and take appropriate action.</p>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Expiry notification email sent successfully:', info.messageId);
    
    return res.status(200).json({
      success: true,
      messageId: info.messageId
    });
  } catch (error) {
    console.error('Email sending failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});