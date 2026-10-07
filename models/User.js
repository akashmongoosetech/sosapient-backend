const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters'],
    maxlength: [50, 'First name must be at most 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters'],
    maxlength: [50, 'Last name must be at most 50 characters']
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username must be at most 30 characters'],
    match: [/^[a-z0-9_.]+$/, 'Username may contain lowercase letters, numbers, dot and underscore only']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: [160, 'Email is too long'],
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  mobile: {
    type: String,
    required: [true, 'Mobile number is required'],
    unique: true,
    trim: true,
    maxlength: [20, 'Mobile number is too long']
  },
  profilePic: {
    type: String,
    trim: true,
    default: '',
    maxlength: [2000, 'Profile picture URL is too long']
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['USER', 'ADMIN'],
    default: 'USER',
    index: true
  },
  tokenVersion: {
    type: Number,
    default: 0,
    index: true
  },
  refreshTokens: {
    type: [{ hash: { type: String }, createdAt: { type: Date, default: Date.now }, expiresAt: { type: Date } }],
    default: [],
    select: false
  }
}, { timestamps: true });



userSchema.methods.toSafeJSON = function () {
  return {
    id: String(this._id),
    firstName: this.firstName,
    lastName: this.lastName,
    username: this.username,
    email: this.email,
    mobile: this.mobile,
    profilePic: this.profilePic || '',
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('User', userSchema);
