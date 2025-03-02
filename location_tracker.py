import tkinter as tk
from tkinter import messagebox
import folium
import webbrowser
import socket
import json
import threading
import os
from datetime import datetime

class LocationTracker:
    def __init__(self, root):
        self.root = root
        self.root.title("Device Location Tracker")
        self.root.geometry("600x400")
        
        self.server_socket = None
        self.is_server_running = False
        self.locations = []
        self.host = '0.0.0.0'
        self.port = 5000
        
        self.setup_ui()
    
    def setup_ui(self):
        control_frame = tk.Frame(self.root, padx=10, pady=10)
        control_frame.pack(fill=tk.X)
        
        tk.Label(control_frame, text="Your IP Address:").pack(side=tk.LEFT)
        self.ip_display = tk.Entry(control_frame, width=20, state='readonly')
        self.ip_display.pack(side=tk.LEFT, padx=5)
        self.ip_display.insert(0, self.get_local_ip())
        
        tk.Label(control_frame, text="Port:").pack(side=tk.LEFT)
        self.port_display = tk.Entry(control_frame, width=10, state='readonly')
        self.port_display.pack(side=tk.LEFT, padx=5)
        self.port_display.insert(0, str(self.port))
        
        self.start_button = tk.Button(control_frame, text="Start Server", command=self.start_server)
        self.start_button.pack(side=tk.LEFT, padx=5)
        
        self.stop_button = tk.Button(control_frame, text="Stop Server", command=self.stop_server, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=5)
        
        self.map_button = tk.Button(control_frame, text="Show Map", command=self.show_map, state=tk.DISABLED)
        self.map_button.pack(side=tk.LEFT, padx=5)
        
        self.status_label = tk.Label(self.root, text="Server Status: Stopped", bg="light gray", padx=10, pady=5)
        self.status_label.pack(fill=tk.X, padx=10, pady=5)
        
        history_frame = tk.LabelFrame(self.root, text="Location History", padx=10, pady=10)
        history_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        scrollbar = tk.Scrollbar(history_frame)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.location_listbox = tk.Listbox(history_frame, yscrollcommand=scrollbar.set)
        self.location_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.config(command=self.location_listbox.yview)
    
    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"
    
    def start_server(self):
        if not self.is_server_running:
            try:
                self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.server_socket.bind((self.host, self.port))
                self.server_socket.listen(5)
                
                self.is_server_running = True
                self.status_label.config(text="Server Status: Running", bg="light green")
                self.start_button.config(state=tk.DISABLED)
                self.stop_button.config(state=tk.NORMAL)
                
                threading.Thread(target=self.listen_for_connections, daemon=True).start()
                messagebox.showinfo("Server Started", f"Server running at {self.get_local_ip()}:{self.port}")
            except Exception as e:
                messagebox.showerror("Error", f"Could not start server: {str(e)}")
    
    def stop_server(self):
        if self.is_server_running:
            self.is_server_running = False
            self.server_socket.close()
            self.status_label.config(text="Server Status: Stopped", bg="light gray")
            self.start_button.config(state=tk.NORMAL)
            self.stop_button.config(state=tk.DISABLED)
    
    def listen_for_connections(self):
        while self.is_server_running:
            try:
                client_socket, _ = self.server_socket.accept()
                threading.Thread(target=self.handle_client, args=(client_socket,), daemon=True).start()
            except:
                break
    
    def handle_client(self, client_socket):
        try:
            data = client_socket.recv(4096).decode('utf-8')
            location_data = json.loads(data)
            self.process_location(location_data)
        except:
            pass
        finally:
            client_socket.close()
    
    def process_location(self, location_data):
        try:
            latitude = float(location_data.get('latitude', 0))
            longitude = float(location_data.get('longitude', 0))
            timestamp = location_data.get('timestamp', datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
            device_id = location_data.get('device_id', "Unknown")
            
            location_info = {'latitude': latitude, 'longitude': longitude, 'timestamp': timestamp, 'device_id': device_id}
            self.locations.append(location_info)
            self.root.after(0, self.update_location_display, location_info)
            if self.map_button['state'] == tk.DISABLED:
                self.root.after(0, lambda: self.map_button.config(state=tk.NORMAL))
        except:
            pass
    
    def update_location_display(self, location_info):
        display_text = f"{location_info['timestamp']} - {location_info['device_id']}: {location_info['latitude']:.6f}, {location_info['longitude']:.6f}"
        self.location_listbox.insert(tk.END, display_text)
        self.location_listbox.see(tk.END)
    
    def show_map(self):
        if not self.locations:
            messagebox.showinfo("No Data", "No location data available.")
            return
        
        latest = self.locations[-1]
        m = folium.Map(location=[latest['latitude'], latest['longitude']], zoom_start=14)
        
        for loc in self.locations:
            popup_text = f"Device: {loc['device_id']}<br>Time: {loc['timestamp']}<br>Lat: {loc['latitude']:.6f}<br>Lng: {loc['longitude']:.6f}"
            folium.Marker([loc['latitude'], loc['longitude']], popup=popup_text).add_to(m)
        
        map_file = os.path.join(os.path.expanduser("~"), "device_location_map.html")
        m.save(map_file)
        webbrowser.open('file://' + map_file)
        
if __name__ == "__main__":
    root = tk.Tk()
    app = LocationTracker(root)
    root.mainloop()
