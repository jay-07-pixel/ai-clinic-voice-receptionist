const fs = require('fs');
const path = require('path');

function writeJsonReport(report, outputDir) {
  const filePath = path.join(outputDir, 'evaluation-report.json');
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  writeJsonReport,
};
