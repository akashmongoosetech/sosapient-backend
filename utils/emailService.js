const nodemailer = require("nodemailer");

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
};

function withTimeout(promise, ms = 15000, label = 'Email send timed out') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label)), ms);
    if (t.unref) t.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

const transporter = createTransporter();

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Send contact form email
const sendContactEmail = async (contactData) => {
  // Check if email configuration is available
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email configuration is missing. Please set EMAIL_USER and EMAIL_PASS environment variables.');
  }

  const mailOptions = {
    from: `"SoSapient Contact" <${process.env.EMAIL_USER}>`,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `New Contact Form Submission: ${String(contactData.subject || '').slice(0, 120)}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${escapeHtml(contactData.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(contactData.email)}</p>
      <p><strong>Company:</strong> ${escapeHtml(contactData.company || "N/A")}</p>
      <p><strong>Phone:</strong> ${escapeHtml(contactData.phone || "N/A")}</p>
      <p><strong>Subject:</strong> ${escapeHtml(contactData.subject)}</p>
      <p><strong>Message:</strong> ${escapeHtml(contactData.message)}</p>
      <p><strong>Budget:</strong> ${escapeHtml(contactData.budget || "N/A")}</p>
      <p><strong>Timeline:</strong> ${escapeHtml(contactData.timeline || "N/A")}</p>
    `,
    text: `New contact from ${contactData.name} <${contactData.email}>: ${contactData.subject}\n${contactData.message}`,
  };

  try {
    // Create fresh transporter for contact emails to avoid auth issues
    const contactTransporter = createTransporter();
    await withTimeout(contactTransporter.sendMail(mailOptions), 15000, 'Contact email timed out');
    return true;
  } catch (error) {
    console.error("Error sending contact email");
    throw error;
  }
};

// Email template for applicant
const getApplicantEmailTemplate = (career) => {
  return `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; padding: 30px;">
    <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 0 10px rgba(0,0,0,0.05);">
      
      <!-- Header with Logo -->
      <div style="background-color: #007BFF; padding: 20px; text-align: center;">
        <img src="https://ik.imagekit.io/sentyaztie/Dicon.png?updatedAt=1750067621393" alt="SoSapient Logo" style="max-width: 150px;"/>
      </div>

      <!-- Body -->
      <div style="padding: 30px;">
        <h2 style="color: #333;">Thank You for Applying to <span style="color: #007BFF;">SoSapient</span>!</h2>
        <p style="font-size: 16px; color: #555;">Dear <strong>${escapeHtml(
          career.name
        )}</strong>,</p>
        <p style="font-size: 15px; color: #555;">We have received your application for the <strong>${escapeHtml(
          career.position
        )}</strong> position. We're excited to review your profile!</p>

        <h3 style="color: #007BFF;">Application Details:</h3>
        <ul style="list-style: none; padding: 0; font-size: 15px; color: #444;">
          <li><strong>Position:</strong> ${escapeHtml(career.position)}</li>
          <li><strong>Email:</strong> ${escapeHtml(career.email)}</li>
          <li><strong>Phone:</strong> ${escapeHtml(career.phone)}</li>
        </ul>

        <p style="font-size: 15px; color: #555;">Our team will review your application and contact you soon.</p>
        <p style="margin-top: 25px; font-size: 15px; color: #555; line-height: 1.6;">
  <strong>Best regards,</strong><br>
  Ritu Chouhan<br>
  HR Head - Operations<br>
  SoSapient
</p>
        <img src="https://ik.imagekit.io/sentyaztie/Dlogo.png?updatedAt=1749928182723" alt="SoSapient Logo" style="max-width: 150px;"/>
      </div>

      <!-- Footer -->
      <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
        <p style="margin: 0 0 10px; color: #777; font-size: 13px;">Follow us on:</p>
        <div style="margin-bottom: 10px;">
          <a href="https://www.facebook.com/profile.php?id=61553017931533" style="margin: 0 10px;">
            <img src="https://cdn-icons-png.flaticon.com/24/733/733547.png" alt="Facebook" style="vertical-align: middle;" />
          </a>
          <a href="https://x.com/SoSapient_tech" style="margin: 0 10px;">
            <img src="https://cdn-icons-png.flaticon.com/24/733/733579.png" alt="Twitter" style="vertical-align: middle;" />
          </a>
          <a href="https://www.linkedin.com/company/100043699/admin/page-posts/published/" style="margin: 0 10px;">
            <img src="https://cdn-icons-png.flaticon.com/24/733/733561.png" alt="LinkedIn" style="vertical-align: middle;" />
          </a>
          <a href="https://www.instagram.com/sosapient/" style="margin: 0 10px;">
            <img src="https://cdn-icons-png.flaticon.com/24/733/733558.png" alt="Instagram" style="vertical-align: middle;" />
          </a>
        </div>
        <p style="color: #999; font-size: 12px;">© ${new Date().getFullYear()} SoSapient. All rights reserved.<br/>
        <a href="https://sosapient.in" style="color: #007BFF; text-decoration: none;">Visit our Website</a> |
        <a href="mailto:hr.sosapient@gmail.com" style="color: #007BFF; text-decoration: none;">hr.sosapient@gmail.com</a></p>
      </div>
    </div>
  </div>
  `;
};

// Email template for admin
const getAdminEmailTemplate = (career) => {
  return `
    <h2>New Job Application Received</h2>
    <p>A new job application has been submitted:</p>
    <ul>
      <li>Name: ${escapeHtml(career.name)}</li>
      <li>Position: ${escapeHtml(career.position)}</li>
      <li>Email: ${escapeHtml(career.email)}</li>
      <li>Phone: ${escapeHtml(career.phone)}</li>
      <li>Experience: ${escapeHtml(career.experience)} years</li>
      <li>Message: ${escapeHtml(career.message || "No message provided")}</li>
    </ul>
    <p>Please review the application in the admin dashboard.</p>
  `;
};

// Send emails to both applicant and admin
const sendCareerEmail = async (career) => {
  try {
    // Sequential with per-mail timeout so an SMTP outage cannot hang the request
    await withTimeout(transporter.sendMail({
      from: `"SoSapient" <${process.env.EMAIL_USER}>`,
      to: career.email,
      subject: "Thank you for your job application - SoSapient",
      html: getApplicantEmailTemplate(career),
    }), 15000, 'Applicant email timed out');

    // Send email to admin
    await withTimeout(transporter.sendMail({
      from: `"SoSapient" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      subject: "New Job Application Received",
      html: getAdminEmailTemplate(career),
    }), 15000, 'Admin email timed out');

    return true;
  } catch (error) {
    console.error("Error sending career emails");
    throw error;
  }
};

module.exports = {
  sendContactEmail,
  sendCareerEmail,
};
