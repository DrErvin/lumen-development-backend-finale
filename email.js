const nodemailer = require("nodemailer");

// Create a reusable transporter
const transporter = nodemailer.createTransport({
  service: "Gmail", // Change if using another email service
  auth: {
    user: "noreply.company.student.platform@gmail.com", // Application email
    pass: "nuvh kabr irkk jvcz", // App password // App password
  },
});

// Verify transporter connection
transporter.verify(function (error, success) {
  if (error) {
    console.error("Transporter Error:", error);
  } else {
    console.log("Transporter is ready to send emails");
  }
});

module.exports = transporter;
