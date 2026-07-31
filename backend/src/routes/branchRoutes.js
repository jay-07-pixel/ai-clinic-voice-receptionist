const express = require('express');
const branchController = require('../controllers/branchController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateListBranches,
  validateGetBranch,
  validateListBranchDoctors,
  validateGetBranchHours,
} = require('../validators/branchValidator');

const router = express.Router();

router.get('/', validateRequest(validateListBranches), branchController.listBranches);

router.get(
  '/:branchId/doctors',
  validateRequest(validateListBranchDoctors),
  branchController.listBranchDoctors,
);

router.get(
  '/:branchId/hours',
  validateRequest(validateGetBranchHours),
  branchController.getBranchHours,
);

router.get('/:branchId', validateRequest(validateGetBranch), branchController.getBranch);

module.exports = router;
