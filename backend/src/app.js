require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');

const industriesRouter = require('./routes/industries');
const propertiesRouter = require('./routes/properties');
const propertyValuesRouter = require('./routes/propertyValues');
const skuRouter = require('./routes/sku');
const skuItemsRouter = require('./routes/skuItems');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/industries', industriesRouter);
app.use('/api', propertiesRouter);
app.use('/api', propertyValuesRouter);
app.use('/api/sku', skuRouter);
app.use('/api/sku-items', skuItemsRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
