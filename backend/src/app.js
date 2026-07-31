const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const config = require('./config');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(compression());
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      // Preserve raw body for Retell (and future) webhook signature verification.
      req.rawBody = buf.toString('utf8');
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan(config.isProduction ? 'combined' : 'dev', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }),
);

app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
