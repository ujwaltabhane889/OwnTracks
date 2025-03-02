// owntracks-adapter.js

class OwnTracksAdapter {
    constructor(serverUrl) {
        this.serverUrl = serverUrl || window.location.origin + '/api/location';
        this.deviceId = localStorage.getItem('owntracks-device-id');
        if (!this.deviceId) {
            this.deviceId = this.generateDeviceId();
            localStorage.setItem('owntracks-device-id', this.deviceId);
        }
        console.log('OwnTracks adapter initialized for device:', this.deviceId);
    }

    generateDeviceId() {
        const timestamp = new Date().getTime();
        const random = Math.floor(Math.random() * 10000);
        return `owntracks/user/${timestamp}${random}`;
    }

    // Convert browser geolocation to OwnTracks format
    formatPosition(position) {
        const { latitude, longitude, accuracy } = position.coords;
        const timestamp = position.timestamp || new Date().getTime();
        
        return {
            _type: "location",
            lat: latitude,
            lon: longitude,
            acc: accuracy,
            tst: Math.floor(timestamp / 1000),
            tid: this.deviceId.split('/').pop(),
            topic: this.deviceId,
            // Include original fields for backward compatibility
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            timestamp: new Date(timestamp).toISOString(),
            deviceId: this.deviceId
        };
    }

    // Send location to server using OwnTracks format
    publishLocation(position) {
        const payload = this.formatPosition(position);
        
        return fetch(this.serverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-OwnTracks-API': 'true' // Make it look like an OwnTracks API call
            },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(data => {
            console.log('OwnTracks location published:', data);
            return data;
        })
        .catch(error => {
            console.error('OwnTracks publication error:', error);
            throw error;
        });
    }

    // Start tracking location (wrapper for browser geolocation)
    startTracking(successCallback, errorCallback) {
        if (!navigator.geolocation) {
            if (errorCallback) errorCallback(new Error('Geolocation not supported'));
            return null;
        }
        
        const options = { 
            enableHighAccuracy: true, 
            maximumAge: 30000, 
            timeout: 27000 
        };
        
        // Wrap the callbacks to include OwnTracks formatting
        const wrappedSuccess = (position) => {
            // Automatically publish to server
            this.publishLocation(position)
                .then(() => {
                    if (successCallback) successCallback(position);
                })
                .catch(err => {
                    console.warn('Failed to publish location but continuing tracking', err);
                    if (successCallback) successCallback(position);
                });
        };
        
        return navigator.geolocation.watchPosition(
            wrappedSuccess,
            errorCallback,
            options
        );
    }

    // Stop tracking
    stopTracking(watchId) {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            return true;
        }
        return false;
    }

    // Get current position once
    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    // Publish and resolve
                    this.publishLocation(position)
                        .then(() => resolve(position))
                        .catch(err => {
                            console.warn('Failed to publish one-time location', err);
                            resolve(position); // Still resolve with the position
                        });
                },
                (error) => reject(error),
                { 
                    enableHighAccuracy: true, 
                    maximumAge: 0, 
                    timeout: 10000 
                }
            );
        });
    }
}

// Export for use in other scripts
window.OwnTracksAdapter = OwnTracksAdapter;
