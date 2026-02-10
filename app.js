// TradeVision Core V1
// Institutional Logic + Client Side Rendering

const chartOptions = {
    layout: {
        background: { type: 'solid', color: '#000000' },
        textColor: '#d1d4dc',
    },
    grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
    },
    crosshair: { mode: 0 }, // Magnet mode
    timeScale: {
        borderColor: '#485c7b',
        timeVisible: true,
    },
};

// --- DOM ELEMENTS ---
const chartContainer = document.getElementById('chartContainer');
const fileInput = document.getElementById('fileInput');
const btnForward = document.getElementById('btnForward');
const statusText = document.getElementById('status');
const regimeBadge = document.getElementById('regimeBadge');

// --- CHART INIT ---
const chart = LightweightCharts.createChart(chartContainer, chartOptions);
const candleSeries = chart.addCandlestickSeries({
    upColor: '#089981', downColor: '#f23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645'
});
const simSeries = chart.addCandlestickSeries({
    upColor: '#00FFFF', downColor: '#FF00FF', borderVisible: true, borderColor: '#00FFFF', wickUpColor: '#00FFFF', wickDownColor: '#FF00FF' 
});

// --- STATE ---
let historyData = [];
let lastCandle = null;
let currentVol = 0;

// --- RESIZE HANDLER ---
new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== chartContainer) { return; }
    const newRect = entries[0].contentRect;
    chart.applyOptions({ height: newRect.height, width: newRect.width });
}).observe(chartContainer);


// --- 1. DATA ENGINE ---
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    statusText.innerText = "Parsing Data...";
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const text = event.target.result;
        const rows = text.split('\n');
        const parsedData = [];

        // Simple CSV Parser (Assumes: Date, Open, High, Low, Close)
        // Skips header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i].split(',');
            if (row.length < 5) continue;

            // Try to auto-detect columns (simplified for V1)
            // Assuming Standard Format or TradingView Export
            let timeVal = row[0];
            
            // Fix Date format if needed (YYYY-MM-DD)
            const date = new Date(timeVal).getTime() / 1000;
            if (isNaN(date)) continue;

            parsedData.push({
                time: date,
                open: parseFloat(row[1]),
                high: parseFloat(row[2]),
                low: parseFloat(row[3]),
                close: parseFloat(row[4])
            });
        }

        historyData = parsedData;
        lastCandle = historyData[historyData.length - 1];
        
        candleSeries.setData(historyData);
        calculateRegime();
        
        statusText.innerText = `Loaded ${historyData.length} bars. Ready.`;
        statusText.style.color = "#00FF00";
        btnForward.disabled = false;
        
        // Zoom to recent
        chart.timeScale().fitContent();
    };
    
    reader.readAsText(file);
});


// --- 2. REGIME ENGINE (Simplified) ---
function calculateRegime() {
    // Look at last 20 candles
    if (historyData.length < 20) return;
    
    const slice = historyData.slice(-20);
    const returns = [];
    
    for(let i=1; i<slice.length; i++) {
        const r = (slice[i].close - slice[i-1].close) / slice[i-1].close;
        returns.push(r);
    }
    
    // Std Dev (Volatility)
    const mean = returns.reduce((a, b) => a + b) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    currentVol = Math.sqrt(variance);
    
    // Trend Slope
    const first = slice[0].close;
    const last = slice[slice.length-1].close;
    const change = (last - first) / first;
    
    let label = "NEUTRAL";
    if (change > 0.05) label = "STRONG BULL";
    else if (change < -0.05) label = "STRONG BEAR";
    else if (currentVol > 0.02) label = "VOLATILE CHOP";
    
    regimeBadge.innerText = label;
}


// --- 3. SIMULATION ENGINE (Forward Bar) ---
btnForward.addEventListener('click', () => {
    if (!lastCandle) return;
    
    // 1. Determine Drift based on random walk
    // 50/50 chance of up/down, weighted by recent trend could be added here
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    // 2. Calculate Move Size (Shock) based on Volatility
    // We use a Box-Muller transform for normal distribution approximation
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    
    const shock = z * currentVol; // Apply volatility
    
    // 3. Construct Candle
    const prevClose = lastCandle.close;
    const newClose = prevClose * (1 + shock);
    const newOpen = prevClose;
    
    const high = Math.max(newOpen, newClose) * (1 + (Math.random() * currentVol * 0.5));
    const low = Math.min(newOpen, newClose) * (1 - (Math.random() * currentVol * 0.5));
    
    // 4. Time Propagation (Add 1 Day approx 86400s)
    const newTime = lastCandle.time + 86400; 
    
    const simCandle = {
        time: newTime,
        open: newOpen,
        high: high,
        low: low,
        close: newClose
    };
    
    // Update State
    simSeries.update(simCandle);
    lastCandle = simCandle; // The sim becomes the new "last" for next iteration
    
    // Scroll to new candle
    chart.timeScale().scrollToPosition(0, true);
});
