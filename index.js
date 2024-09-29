const express = require('express');
const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const axios = require('axios');

// Express server setup
const app = express();
const port = 3000;

// Function to fetch EUR/USD data from the Finazone API
async function fetchForexData() {
    try {
const FINAZON_API_URL = 'https://api.finazon.io/latest/finazon/forex/time_series?ticker=EUR/USD&interval=1m&page=0&page_size=500&apikey=18535cbd97e2400d93f96802097d83c9af';

        const response = await axios.get(FINAZON_API_URL); // Replace with the actual API endpoint
        const data =  response.data.data;// Adjust based on the actual response structure
        return data;
    } catch (error) {
        console.error('Error fetching data from Finazone API:', error);
        return null;
    }
}

// Convert the data into a format suitable for TensorFlow
function prepareData(data) {
    const closes = data.map(d => d.c); // Use close price as input feature
    const inputs = [];
    const outputs = [];

    for (let i = 0; i < closes.length - 5; i++) {
        inputs.push(closes.slice(i, i + 5));  // Take 5-minute history as input
        const currentPrice = closes[i + 4];
        const nextPrice = closes[i + 5];

        if (nextPrice > currentPrice) {
            outputs.push([1, 0, 0]); // Up
        } else if (nextPrice < currentPrice) {
            outputs.push([0, 1, 0]); // Down
        } else {
            outputs.push([0, 0, 1]); // Flat
        }
    }
    return { inputs, outputs };
}

// Function to train the model
async function trainModel(model, inputs, outputs) {
    const inputTensor = tf.tensor2d(inputs);
    const outputTensor = tf.tensor2d(outputs);

    await model.fit(inputTensor, outputTensor, {
        epochs: 50,
        batchSize: 8
    });
    console.log("Model training complete!");
}

// Function to predict the next 5 minutes movement
async function predictNext5Minutes(model, newData) {
    const closes = newData.map(d => d.c);
    const inputForPrediction = tf.tensor2d([closes]);

    const prediction = await model.predict(inputForPrediction).dataSync();

    // Find the class with the highest probability
    const maxIndex = prediction.indexOf(Math.max(...prediction));

    if (maxIndex === 0) {
        return "UP";
    } else if (maxIndex === 1) {
        return "DOWN";
    } else {
        return "FLAT";
    }
}

// Build the TensorFlow model
function buildModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 10, inputShape: [5], activation: 'relu' }));
    model.add(tf.layers.dense({ units: 5, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 3, activation: 'softmax' })); // Multi-class

    model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy', // Multi-class classification
        metrics: ['accuracy']
    });

    return model;
}

// Route for prediction
app.get('/predict', async (req, res) => {
    const rawData = await fetchForexData();
    if (!rawData) {
        return res.status(500).json({ status: 'error', message: 'Failed to fetch forex data' });
    }

    const { inputs, outputs } = prepareData(rawData);

    const model = buildModel();

    // Ensure the model is trained before predicting
    await trainModel(model, inputs, outputs);

    // Get the last 5 minutes of data for prediction
    const last5Minutes = rawData.slice(-5);

    // Make a prediction based on the latest data
    const prediction = await predictNext5Minutes(model, last5Minutes);

    res.json({
        status: 'success',
        prediction: prediction
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Forex prediction app running on http://localhost:${port}`);
});
