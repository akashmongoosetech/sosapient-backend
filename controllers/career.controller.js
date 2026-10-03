const Career = require('../models/career.model');
const { sendCareerEmail } = require('../utils/emailService');

function errMsg(error, fallback) {
  return process.env.NODE_ENV === 'production' ? fallback : (error.message || fallback);
}
const CAREER_FIELDS = ['name', 'email', 'phone', 'position', 'experience', 'currentCompany', 'expectedSalary', 'noticePeriod', 'coverLetter'];
function pickCareer(body = {}) {
  const out = {};
  for (const k of CAREER_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}
function stripResume(doc) {
  const obj = doc.toObject();
  return { ...obj, resume: obj.resume ? { filename: obj.resume.filename, contentType: obj.resume.contentType } : undefined };
}

// Create new career application
const createCareer = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Resume file is required' });
    }

    const careerData = {
      ...pickCareer(req.body),
      resume: {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        filename: req.file.originalname
      },
      status: 'pending'
    };

    const career = await Career.create(careerData);

    // Send email notification
    try {
      await sendCareerEmail(career);
    } catch (emailError) {
      console.error('Error sending career email notification');
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      data: stripResume(career)
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: errMsg(error, 'Error creating career application')
    });
  }
};

// Get all career applications
const getAllCareers = async (req, res) => {
  try {
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const careers = await Career.find().select('-resume.data').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    res.status(200).json({
      success: true,
      data: careers,
      pagination: { page, limit }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: errMsg(error, 'Error fetching career applications')
    });
  }
};

// Get single career application
const getCareer = async (req, res) => {
  try {
    const career = await Career.findById(req.params.id).select('-resume.data');
    if (!career) {
      return res.status(404).json({
        success: false,
        message: 'Career application not found'
      });
    }
    res.status(200).json({
      success: true,
      data: career
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: errMsg(error, 'Error fetching career application')
    });
  }
};

// Update career application status
const updateCareer = async (req, res) => {
  try {
    const allowed = ['pending', 'reviewed', 'shortlisted', 'rejected'];
    if (req.body.status && !allowed.includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }
    const career = await Career.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    ).select('-resume.data');
    if (!career) {
      return res.status(404).json({
        success: false,
        message: 'Career application not found'
      });
    }
    res.status(200).json({
      success: true,
      data: career
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: errMsg(error, 'Error updating career application')
    });
  }
};

// Delete career application
const deleteCareer = async (req, res) => {
  try {
    const career = await Career.findByIdAndDelete(req.params.id);
    if (!career) {
      return res.status(404).json({
        success: false,
        message: 'Career application not found'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Career application deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: errMsg(error, 'Error deleting career application')
    });
  }
};

module.exports = {
  createCareer,
  getAllCareers,
  getCareer,
  updateCareer,
  deleteCareer
}; 