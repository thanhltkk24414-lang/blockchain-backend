// 📄 KIỂM TRA FILE NÀY ĐÃ CÓ CHƯA
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

// Custom validators
const validators = {
  // Kiểm tra địa chỉ Ethereum
  isEthereumAddress: (value) => {
    return /^0x[a-fA-F0-9]{40}$/.test(value);
  },

  // Kiểm tra số dương
  isPositiveNumber: (value) => {
    return typeof value === 'number' && value > 0;
  },

  // Kiểm tra rating (1-5)
  isValidRating: (value) => {
    return Number.isInteger(value) && value >= 1 && value <= 5;
  }
};

module.exports = {
  validate,
  validators
};