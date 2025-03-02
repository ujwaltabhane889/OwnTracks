const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// In-memory storage (replace with a database for production)
const locationHistory = {};

// Middleware
app.use(cors());
app.use(express.json());

// Create the viewer page if it doesn't exist
const viewerPath = path.join(__dirname, 'viewer.html');
if (!fs.existsSync(viewerPath)) {
  // Copy the content from the artifact to the file
  fs.writeFileSync(viewerPath, `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OwnTracker - Device Viewer</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css" />
    <style>
        body, html {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            font-family: Arial, sans-serif;
        }
        #container {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        #header {
            background-color: #2c3e50;
            color: white;
            padding: 10px;
            text-align: center;
        }
        #map {
            flex-grow: 1;
            width: 100%;
        }
        #device-list {
            position: fixed;
            top: 70px;
            right: 10px;
            padding: 10px;
            background-color: white;
            border-radius: 4px;
            z-index: 1000;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            max-height: 300px;
            overflow-y: auto;
        }
        .device-item {
            margin-bottom: 5px;
            cursor: pointer;
            padding: 5px;
            border-radius: 3px;
        }
        .device-item:hover {
            background-color: #f0f0f0;
        }
        .device-item.active {
            background-color: #e0e0e0;
            font-weight: bold;
        }
        .info-box {
            position: fixed;
            bottom: 10px;
            left: 10px;
            padding: 8px 12px;
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 4px;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <div id="container">
        <div id="header">
            <h1>OwnTracker - Device Viewer</h1>
        </div>
        <div id="map"></div>
        <div id="device-list">
            <h3>Tracked Devices</h3>
            <div id="devices-container">Loading devices...</div>
        </div>
        <div class="info-box">
            <a href="/">Back to My Location</a> | 
            Selected Device: <span id="current-device">None</span>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
    <script>
        // Initialize variables
        let map, markers = {};
        let selectedDeviceId = null;
        
        // Initialize map
        function initMap() {
            map = L.map('map').setView([0, 0], 2);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);
            
            // Load available devices
            loadDevices();
            
            // Set up auto-refresh
            setInterval(refreshDeviceLocations, 30000); // refresh every 30 seconds
        }
        
        // Load list of available devices
        function loadDevices() {
            const host = window.location.origin;
            
            fetch(\`\${host}/api/devices\`)
                .then(response => response.json())
                .then(devices => {
                    displayDeviceList(devices);
                })
                .catch(error => {
                    console.error('Error loading devices:', error);
                    document.getElementById('devices-container').textContent = 'Error loading devices. Try refreshing.';
                });
        }
        
        // Display the list of devices
        function displayDeviceList(devices) {
            const container = document.getElementById('devices-container');
            
            if (!devices || devices.length === 0) {
                container.textContent = 'No devices found. Share location from a device first.';
                return;
            }
            
            container.innerHTML = '';
            
            devices.forEach(device => {
                const deviceElement = document.createElement('div');
                deviceElement.className = 'device-item';
                deviceElement.textContent = \`Device \${device.id.substring(7)} - \${device.lastSeen}\`;
                deviceElement.dataset.id = device.id;
                
                deviceElement.addEventListener('click', () => {
                    selectDevice(device.id);
                });
                
                container.appendChild(deviceElement);
            });
            
            // Select the first device by default
            if (devices.length > 0 && !selectedDeviceId) {
                selectDevice(devices[0].id);
            }
        }
        
        // Select a device and load its location
        function selectDevice(deviceId) {
            selectedDeviceId = deviceId;
            
            // Update UI
            document.querySelectorAll('.device-item').forEach(el => {
                el.classList.remove('active');
                if (el.dataset.id === deviceId) {
                    el.classList.add('active');
                }
            });
            
            document.getElementById('current-device').textContent = deviceId.substring(7);
            
            // Load location for this device
            loadDeviceLocation(deviceId);
        }
        
        // Load location data for a specific device
        function loadDeviceLocation(deviceId) {
            const host = window.location.origin;
            
            fetch(\`\${host}/api/location/\${deviceId}\`)
                .then(response => response.json())
                .then(locations => {
                    displayDeviceLocation(deviceId, locations);
                })
                .catch(error => {
                    console.error(\`Error loading location for device \${deviceId}:\`, error);
                });
        }
        
        // Display a device's location on the map
        function displayDeviceLocation(deviceId, locations) {
            // Remove existing marker if any
            if (markers[deviceId]) {
                map.removeLayer(markers[deviceId].marker);
                if (markers[deviceId].circle) {
                    map.removeLayer(markers[deviceId].circle);
                }
                if (markers[deviceId].path) {
                    map.removeLayer(markers[deviceId].path);
                }
            }
            
            if (!locations || locations.length === 0) {
                console.log(\`No location data for device \${deviceId}\`);
                return;
            }
            
            // Get the most recent location
            const lastLocation = locations[locations.length - 1];
            const { latitude, longitude } = lastLocation;
            
            // Create marker
            const marker = L.marker([latitude, longitude]).addTo(map);
            marker.bindPopup(\`Device: \${deviceId.substring(7)}<br>Last update: \${new Date(lastLocation.timestamp).toLocaleString()}\`);
            
            // Create accuracy circle if available
            let circle = null;
            if (lastLocation.accuracy) {
                circle = L.circle([latitude, longitude], {
                    radius: lastLocation.accuracy,
                    color: '#3388ff',
                    fillColor: '#3388ff',
                    fillOpacity: 0.2
                }).addTo(map);
            }
            
            // Create path if there are multiple locations
            let path = null;
            if (locations.length > 1) {
                const points = locations.map(loc => [loc.latitude, loc.longitude]);
                path = L.polyline(points, { color: 'red', weight: 3 }).addTo(map);
            }
            
            // Store references
            markers[deviceId] = { marker, circle, path };
            
            // Center map on this location
            map.setView([latitude, longitude], 16);
        }
        
        // Refresh locations of all devices
        function refreshDeviceLocations() {
            if (selectedDeviceId) {
                loadDeviceLocation(selectedDeviceId);
            }
        }
        
        // Initialize the map when the page loads
        window.onload = initMap;
    </script>
</body>
</html>`);
}

// Serve static files directly from the root directory
app.use(express.static(path.join(__dirname)));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// New route for the device viewer
app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'viewer.html'));
});

// API endpoint to receive location updates
app.post('/api/location', (req, res) => {
  const { latitude, longitude, timestamp, deviceId, accuracy } = req.body;
  
  if (!latitude || !longitude || !deviceId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Store the location
  if (!locationHistory[deviceId]) {
    locationHistory[deviceId] = [];
  }
  
  locationHistory[deviceId].push({
    latitude,
    longitude,
    accuracy: accuracy || null,
    timestamp: timestamp || new Date().toISOString()
  });
  
  // Only keep the last 100 locations per device
  if (locationHistory[deviceId].length > 100) {
    locationHistory[deviceId] = locationHistory[deviceId].slice(-100);
  }
  
  res.json({ success: true });
});

// API endpoint to get location history for a device
app.get('/api/location/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  res.json(locationHistory[deviceId] || []);
});

// API endpoint to get list of devices
app.get('/api/devices', (req, res) => {
  const devices = Object.keys(locationHistory).map(id => {
    const locations = locationHistory[id];
    const lastLocation = locations.length > 0 ? locations[locations.length - 1] : null;
    
    return {
      id: id,
      lastSeen: lastLocation ? new Date(lastLocation.timestamp).toLocaleString() : 'Unknown'
    };
  });
  
  res.json(devices);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Open http://localhost:${port} in your browser`);
});
