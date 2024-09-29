const express = require('express');
const axios = require('axios');
const { EMA, RSI, BollingerBands, Stochastic } = require('technicalindicators');

const app = express();
const port = 3000;

const FINAZON_API_URL = 'https://api.finazon.io/latest/finazon/forex/time_series?ticker=EUR/USD&interval=1m&page=0&page_size=1000&apikey=18535cbd97e2400d93f96802097d83c9af';

// Function to fetch data from Finazon API
const getForexData = async () => {
    try {
        const response = await axios.get(FINAZON_API_URL);
        const data = response.data.data;
        return data;
    } catch (error) {
        console.error('Error fetching data from Finazon API:', error);
        return null;
    }
};

// Function to apply strategies
const applyStrategies = (highPrices, lowPrices, closePrices) => {
    const results = [];

    // Ensure that we have enough data points for each strategy (especially Bollinger Bands)
    const requiredDataPoints = 200; // Ensure at least 200 data points for long EMAs
    if (closePrices.length < requiredDataPoints) {
        console.warn('Not enough data to apply strategies.');
        return ['flat']; // Default to 'flat' if insufficient data
    }

    // 1. Trend Analysis (EMA Convergence-Divergence)
    const shortEma = EMA.calculate({ period: 50, values: closePrices });
    const longEma = EMA.calculate({ period: 200, values: closePrices });
    if (shortEma[shortEma.length - 1] > longEma[longEma.length - 1]) {
        results.push('up');
    } else if (shortEma[shortEma.length - 1] < longEma[longEma.length - 1]) {
        results.push('down');
    }

    // 2. Volume and Volatility Analysis (Bollinger Bands)
    if (closePrices.length >= 20) {  // Ensure at least 20 data points for Bollinger Bands
        const bollinger = BollingerBands.calculate({ period: 20, stdDev: 2, values: closePrices });

        if (bollinger.length > 0) {
            const lastClose = closePrices[closePrices.length - 1];
            const lastBollinger = bollinger[bollinger.length - 1];

            if (lastClose > lastBollinger.upper) {
                results.push('up');
            } else if (lastClose < lastBollinger.lower) {
                results.push('down');
            } else {
                results.push('flat');
            }
        } else {
            console.warn('Not enough data to calculate Bollinger Bands');
            results.push('flat');
        }
    } else {
        results.push('flat'); // Default to flat if not enough data for Bollinger Bands
    }

    // 3. Oscillator Analysis (RSI & Stochastic Oscillator)
    const rsi = RSI.calculate({ period: 14, values: closePrices });
    const stochastic = Stochastic.calculate({
        period: 14,
        signalPeriod: 3,
        high: highPrices,
        low: lowPrices,
        close: closePrices
    });
    const k = stochastic[stochastic.length - 1]?.k;
    const d = stochastic[stochastic.length - 1]?.d;

    if (rsi[rsi.length - 1] > 70 || (k > 80 && k < d)) {
        results.push('down');
    } else if (rsi[rsi.length - 1] < 30 || (k < 20 && k > d)) {
        results.push('up');
    }

    // 4. Support and Resistance Zones
    const high = Math.max(...highPrices);
    const low = Math.min(...lowPrices);
    const currentPrice = closePrices[closePrices.length - 1];

    const supportLevel = low + (high - low) * 0.382; // Fibonacci retracement for support
    const resistanceLevel = low + (high - low) * 0.618; // Fibonacci retracement for resistance

    if (currentPrice > resistanceLevel) {
        results.push('up');
    } else if (currentPrice < supportLevel) {
        results.push('down');
    } else {
        results.push('flat');
    }

    return results;
};

// Combine strategy results using a Custom Ensemble Model (Voting System)
const combineResults = (results) => {
    const upVotes = results.filter(v => v === 'up').length;
    const downVotes = results.filter(v => v === 'down').length;
    const flatVotes = results.filter(v => v === 'flat').length;

    if (upVotes > downVotes && upVotes > flatVotes) {
        return 'UP';
    } else if (downVotes > upVotes && downVotes > flatVotes) {
        return 'DOWN';
    } else {
        return 'FLAT';
    }
};

// Main route to predict EUR/USD movement
app.get('/predict', async (req, res) => {
    const forexData = await getForexData();
    if (!forexData) {
        return res.status(500).send('Error fetching forex data');
    }

    // Extract price data from the API response
    const closePrices = forexData.map(candle => candle.c);
    const highPrices = forexData.map(candle => candle.h);
    const lowPrices = forexData.map(candle => candle.l);

    // Apply the strategies to the data
    const strategyResults = applyStrategies(highPrices, lowPrices, closePrices);

    // Combine the results and make the final prediction
    const finalPrediction = combineResults(strategyResults);

    // Send the final prediction as the response
    res.json({ prediction: finalPrediction });
});

// Start the server
app.listen(port, () => {
    console.log(`Forex predictor app running on http://localhost:${port}`);
});
