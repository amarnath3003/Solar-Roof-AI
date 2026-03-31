import React, { useState, useEffect, useRef } from "react";
import "./styles.css";

// Import Leaflet directly to ensure it's available before react-leaflet is used
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Import Leaflet Draw plugin properly
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

export default function App() {
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [coordinates, setCoordinates] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(21);

  // Drawing data
  const [roofElements, setRoofElements] = useState([]);
  const [obstacleMarkers, setObstacleMarkers] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [map, setMap] = useState(null);
  const [drawControl, setDrawControl] = useState(null);
  const [featureGroup, setFeatureGroup] = useState(null);

  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const imageRef = useRef(null);
  const mapContainerRef = useRef(null);
  // Create a ref to keep track of the feature group
  const featureGroupRef = useRef(null);

  // Your Google Maps API key
  const API_KEY = "AIzaSyB4Tq-lG0ZdXY8KuhwaJQHY4b0n1oYTfdY";

  // Load Google Maps API script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    script.async = true;
    script.onload = initAutocomplete;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const initAutocomplete = () => {
    if (!inputRef.current) return;

    // Initialize Google Places Autocomplete
    autocompleteRef.current = new window.google.maps.places.Autocomplete(
      inputRef.current,
      { types: ["address"] }
    );

    // Add place_changed event listener
    autocompleteRef.current.addListener("place_changed", handlePlaceSelect);
  };

  // Handle selection from Google Places Autocomplete
  const handlePlaceSelect = () => {
    const place = autocompleteRef.current.getPlace();

    if (!place.geometry) {
      console.error("No geometry found for this place");
      return;
    }

    const formattedAddress = place.formatted_address;
    setAddress(formattedAddress);
    setSelectedAddress(formattedAddress);

    const coords = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    };

    setCoordinates(coords);
    generateStaticMapUrl(coords, zoomLevel);
    setShowMap(false); // Reset to show static image first

    // Clean up existing map if it exists
    if (map) {
      map.remove();
      setMap(null);
      setFeatureGroup(null);
      featureGroupRef.current = null;
    }
  };

  // Generate Google Maps Static API URL with specified zoom level
  const generateStaticMapUrl = (coords, zoom) => {
    const { lat, lng } = coords;
    const size = "640x640";
    const scale = 2;

    // Parameters to remove map UI elements
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${size}&scale=${scale}&maptype=satellite&style=feature:all|element:labels|visibility:off&style=feature:administrative|visibility:off&style=feature:poi|visibility:off&style=feature:road|visibility:off&style=feature:transit|visibility:off&key=${API_KEY}`;

    setImageUrl(url);
  };

  // Handle zoom level change
  const handleZoomChange = (newZoom) => {
    setZoomLevel(newZoom);
    if (coordinates) {
      generateStaticMapUrl(coordinates, newZoom);
    }
  };

  // Show Leaflet map for roof tracing
  const showLeafletMap = () => {
    setShowMap(true);

    // Initialize the map after the component renders
    setTimeout(() => {
      initializeMap();
    }, 100);
  };

  // Initialize Leaflet map
  const initializeMap = () => {
    if (!coordinates || !mapContainerRef.current) return;

    // Create a map if it doesn't exist
    if (!map) {
      // Fix for marker icons not showing
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const newMap = L.map(mapContainerRef.current).setView(
        [coordinates.lat, coordinates.lng],
        20
      );

      // Add satellite tile layer
      L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        maxZoom: 22,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
        attribution: "Google Maps",
      }).addTo(newMap);

      // Create feature group for drawn items
      const drawnItems = new L.FeatureGroup();
      newMap.addLayer(drawnItems);

      // Save feature group to both state and ref
      setFeatureGroup(drawnItems);
      featureGroupRef.current = drawnItems;

      // Configure draw control options
      const drawControlOptions = {
        position: "topright",
        draw: {
          polyline: true,
          polygon: true,
          circle: true,
          rectangle: true,
          marker: true,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      };

      // Add draw control to map
      const control = new L.Control.Draw(drawControlOptions);
      newMap.addControl(control);
      setDrawControl(control);

      // Set up event handlers for drawing
      newMap.on(L.Draw.Event.CREATED, handleDrawCreated);
      newMap.on(L.Draw.Event.EDITED, handleDrawEdited);
      newMap.on(L.Draw.Event.DELETED, handleDrawDeleted);

      setMap(newMap);
    }
  };

  // Handle created shapes in Leaflet
  const handleDrawCreated = (e) => {
    const { layerType, layer } = e;

    // Use the feature group ref to ensure we have access to it
    if (featureGroupRef.current) {
      featureGroupRef.current.addLayer(layer);

      if (layerType === "marker") {
        const position = layer.getLatLng();
        const newObstacle = {
          id: Date.now(),
          layerId: featureGroupRef.current.getLayerId(layer),
          type: "obstacle",
          position: [position.lat, position.lng],
          label: "Obstacle",
        };
        setObstacleMarkers((prevMarkers) => [...prevMarkers, newObstacle]);
      } else {
        // For polygons, rectangles, circles, polylines
        const geoJSON = layer.toGeoJSON();
        const newElement = {
          id: Date.now(),
          layerId: featureGroupRef.current.getLayerId(layer),
          type: layerType,
          geoJSON: geoJSON,
          style: {
            color:
              layerType === "polygon" || layerType === "rectangle"
                ? "#3388ff"
                : layerType === "circle"
                ? "#33cc33"
                : "#ff3333",
          },
        };
        setRoofElements((prevElements) => [...prevElements, newElement]);
      }
    }
  };

  // Handle edited shapes
  const handleDrawEdited = (e) => {
    if (!featureGroupRef.current) return;

    const layers = e.layers;
    layers.eachLayer((layer) => {
      const id = featureGroupRef.current.getLayerId(layer);

      // Check if it's a marker (obstacle)
      if (layer instanceof L.Marker) {
        const position = layer.getLatLng();
        setObstacleMarkers((prevMarkers) =>
          prevMarkers.map((obstacle) =>
            obstacle.layerId === id
              ? { ...obstacle, position: [position.lat, position.lng] }
              : obstacle
          )
        );
      } else {
        // It's a roof element (polygon, rectangle, etc.)
        const geoJSON = layer.toGeoJSON();
        setRoofElements((prevElements) =>
          prevElements.map((element) =>
            element.layerId === id ? { ...element, geoJSON: geoJSON } : element
          )
        );
      }
    });
  };

  // Handle deleted shapes
  const handleDrawDeleted = (e) => {
    if (!featureGroupRef.current) return;

    const layers = e.layers;
    layers.eachLayer((layer) => {
      const id = featureGroupRef.current.getLayerId(layer);

      // Remove from obstacles if it's a marker
      if (layer instanceof L.Marker) {
        setObstacleMarkers((prevMarkers) =>
          prevMarkers.filter((obstacle) => obstacle.layerId !== id)
        );
      } else {
        // Remove from roof elements
        setRoofElements((prevElements) =>
          prevElements.filter((element) => element.layerId !== id)
        );
      }
    });
  };

  // Export roof data as GeoJSON
  const exportRoofData = () => {
    const data = {
      type: "FeatureCollection",
      features: [
        ...roofElements.map((element) => ({
          ...element.geoJSON,
          properties: {
            ...element.geoJSON.properties,
            elementType: element.type,
            style: element.style,
          },
        })),
        ...obstacleMarkers.map((marker) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [marker.position[1], marker.position[0]],
          },
          properties: {
            type: "obstacle",
            label: marker.label,
          },
        })),
      ],
    };

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(data));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "roof_data.geojson");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Clean up map on component unmount
  useEffect(() => {
    return () => {
      if (map) {
        map.remove();
      }
    };
  }, [map]);

  return (
    <div
      className="app-container"
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      {/* Sidebar */}
      <div
        className="sidebar"
        style={{
          width: "320px",
          backgroundColor: "#383c4a",
          color: "#fff",
          padding: "20px",
          overflowY: "auto",
          boxShadow: "2px 0 5px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ marginBottom: "25px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 5px 0", color: "#5294e2" }}>
            Roof Capture
          </h1>
          <p style={{ color: "#7c818c", fontSize: "14px", margin: "0" }}>
            Trace and analyze building rooftops
          </p>
        </div>

        <div className="sidebar-section" style={{ marginBottom: "25px" }}>
          <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>Location</h3>
          <label
            htmlFor="address"
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "14px",
              color: "#7c818c",
            }}
          >
            Search Address
          </label>
          <input
            ref={inputRef}
            type="text"
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter an address..."
            style={{
              width: "100%",
              padding: "10px",
              border: "none",
              borderRadius: "4px",
              backgroundColor: "#404552",
              color: "#fff",
              marginBottom: "10px",
            }}
          />
        </div>

        {selectedAddress && (
          <div className="sidebar-section" style={{ marginBottom: "25px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>
              Selected Location
            </h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "10px",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              <p style={{ margin: "0" }}>{selectedAddress}</p>
              {coordinates && (
                <p
                  style={{
                    margin: "5px 0 0 0",
                    fontSize: "12px",
                    color: "#7c818c",
                  }}
                >
                  {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
                </p>
              )}
            </div>
          </div>
        )}

        {coordinates && !showMap && (
          <div className="sidebar-section" style={{ marginBottom: "25px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>
              Image Settings
            </h3>
            <label
              htmlFor="zoom"
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                color: "#7c818c",
              }}
            >
              Zoom Level: {zoomLevel}
            </label>
            <input
              type="range"
              id="zoom"
              min="18"
              max="22"
              value={zoomLevel}
              onChange={(e) => handleZoomChange(parseInt(e.target.value))}
              style={{ width: "100%" }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px",
                color: "#7c818c",
              }}
            >
              <span>Wide</span>
              <span>Detailed</span>
            </div>
          </div>
        )}

        {coordinates && !showMap && (
          <div className="sidebar-section" style={{ marginBottom: "25px" }}>
            <button
              onClick={showLeafletMap}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: "#5294e2",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
                transition: "background-color 0.2s",
              }}
              onMouseOver={(e) => (e.target.style.backgroundColor = "#4a85cb")}
              onMouseOut={(e) => (e.target.style.backgroundColor = "#5294e2")}
            >
              Trace Roof Layout
            </button>
          </div>
        )}

        {showMap && (
          <div className="sidebar-section" style={{ marginBottom: "25px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>
              Drawing Tools
            </h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "15px",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              <p style={{ margin: "0 0 10px 0", fontWeight: "bold" }}>
                Instructions:
              </p>
              <ul
                style={{ margin: "0", paddingLeft: "20px", color: "#dcdfe4" }}
              >
                <li style={{ marginBottom: "8px" }}>
                  Use <span style={{ color: "#5294e2" }}>Polygon</span> or{" "}
                  <span style={{ color: "#5294e2" }}>Rectangle</span> tool to
                  trace the roof outline
                </li>
                <li style={{ marginBottom: "8px" }}>
                  Use <span style={{ color: "#5294e2" }}>Circle</span> tool for
                  circular features
                </li>
                <li style={{ marginBottom: "8px" }}>
                  Use <span style={{ color: "#5294e2" }}>Polyline</span> for
                  edges or lines
                </li>
                <li style={{ marginBottom: "8px" }}>
                  Use <span style={{ color: "#5294e2" }}>Marker</span> for
                  obstacles
                </li>
                <li style={{ marginBottom: "8px" }}>
                  Use <span style={{ color: "#5294e2" }}>Edit</span> tools to
                  modify shapes
                </li>
              </ul>
            </div>
          </div>
        )}

        {showMap && (
          <div className="sidebar-section" style={{ marginBottom: "25px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>
              Element Summary
            </h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "15px",
                borderRadius: "4px",
              }}
            >
              <div style={{ marginBottom: "12px" }}>
                <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>
                  Roof Elements: {roofElements.length}
                </p>
                <ul
                  style={{
                    margin: "0",
                    paddingLeft: "20px",
                    color: "#dcdfe4",
                    fontSize: "14px",
                  }}
                >
                  <li>
                    Polygons/Rectangles:{" "}
                    {
                      roofElements.filter(
                        (el) => el.type === "polygon" || el.type === "rectangle"
                      ).length
                    }
                  </li>
                  <li>
                    Circles:{" "}
                    {roofElements.filter((el) => el.type === "circle").length}
                  </li>
                  <li>
                    Lines:{" "}
                    {roofElements.filter((el) => el.type === "polyline").length}
                  </li>
                </ul>
              </div>
              <div>
                <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>
                  Obstacles: {obstacleMarkers.length}
                </p>
              </div>
            </div>
          </div>
        )}

        {showMap && (
          <div className="sidebar-section">
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setShowMap(false)}
                style={{
                  flex: "1",
                  padding: "10px",
                  backgroundColor: "#4b5162",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "background-color 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.target.style.backgroundColor = "#565d72")
                }
                onMouseOut={(e) => (e.target.style.backgroundColor = "#4b5162")}
              >
                Back to Image
              </button>
              <button
                onClick={exportRoofData}
                style={{
                  flex: "1",
                  padding: "10px",
                  backgroundColor: "#5294e2",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "background-color 0.2s",
                }}
                onMouseOver={(e) =>
                  (e.target.style.backgroundColor = "#4a85cb")
                }
                onMouseOut={(e) => (e.target.style.backgroundColor = "#5294e2")}
              >
                Export Data
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className="main-content"
        style={{
          flex: "1",
          backgroundColor: "#404552",
          padding: "20px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!coordinates && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              color: "#7c818c",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: "500px" }}>
              <svg
                width="100"
                height="100"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#5294e2"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginBottom: "20px" }}
              >
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
              <h2 style={{ color: "#5294e2", marginBottom: "15px" }}>
                Welcome to the Roof Capture Tool
              </h2>
              <p style={{ lineHeight: "1.6" }}>
                Start by searching for an address in the sidebar. Once you've
                selected a location, you'll be able to view a satellite image
                and trace the building roof layout.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div
            style={{
              textAlign: "center",
              padding: "30px",
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <p style={{ color: "#fff" }}>Processing image...</p>
          </div>
        )}

        {imageUrl && !isLoading && !showMap && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                backgroundColor: "#383c4a",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "15px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ margin: "0", color: "#5294e2" }}>Satellite View</h2>
              <p style={{ margin: "0", color: "#7c818c", fontSize: "14px" }}>
                Use the slider in the sidebar to adjust zoom level
              </p>
            </div>
            <div
              style={{
                flex: 1,
                border: "2px solid #4b5162",
                borderRadius: "8px",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#383c4a",
              }}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Satellite Image"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          </div>
        )}

        {/* Leaflet Map Container */}
        {showMap && coordinates && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                backgroundColor: "#383c4a",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "15px",
              }}
            >
              <h2 style={{ margin: "0", color: "#5294e2" }}>
                Roof Layout Tracer
              </h2>
            </div>
            <div
              style={{
                flex: 1,
                border: "2px solid #4b5162",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <div
                ref={mapContainerRef}
                style={{
                  height: "100%",
                  width: "100%",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
