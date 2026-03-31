import React, { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";

type Coordinates = {
  lat: number;
  lng: number;
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
};

type RoofElement = {
  id: number;
  layerId: number;
  type: string;
  geoJSON: GeoJSON.Feature;
  style: {
    color: string;
  };
};

type ObstacleMarker = {
  id: number;
  layerId: number;
  type: "obstacle";
  position: [number, number];
  label: string;
};

export default function App() {
  const [address, setAddress] = useState("");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);
  const locationMarkerRef = useRef<L.CircleMarker | null>(null);

  const handleDrawCreated = useCallback((e: any) => {
    const { layerType, layer } = e;
    if (!featureGroupRef.current) {
      return;
    }

    featureGroupRef.current.addLayer(layer);

    if (layerType === "marker") {
      const position = (layer as L.Marker).getLatLng();
      const newObstacle: ObstacleMarker = {
        id: Date.now(),
        layerId: featureGroupRef.current.getLayerId(layer),
        type: "obstacle",
        position: [position.lat, position.lng],
        label: "Obstacle",
      };
      setObstacleMarkers((prevMarkers) => [...prevMarkers, newObstacle]);
      return;
    }

    const geoJSON = layer.toGeoJSON() as GeoJSON.Feature;
    const newElement: RoofElement = {
      id: Date.now(),
      layerId: featureGroupRef.current.getLayerId(layer),
      type: layerType,
      geoJSON,
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
  }, []);

  const handleDrawEdited = useCallback((e: any) => {
    if (!featureGroupRef.current) {
      return;
    }

    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);

      if (layer instanceof L.Marker) {
        const position = layer.getLatLng();
        setObstacleMarkers((prevMarkers) =>
          prevMarkers.map((obstacle) =>
            obstacle.layerId === id
              ? { ...obstacle, position: [position.lat, position.lng] }
              : obstacle
          )
        );
        return;
      }

      const geoJSON = (layer as any).toGeoJSON() as GeoJSON.Feature;
      setRoofElements((prevElements) =>
        prevElements.map((element) =>
          element.layerId === id ? { ...element, geoJSON } : element
        )
      );
    });
  }, []);

  const handleDrawDeleted = useCallback((e: any) => {
    if (!featureGroupRef.current) {
      return;
    }

    e.layers.eachLayer((layer: L.Layer) => {
      const id = featureGroupRef.current!.getLayerId(layer);

      if (layer instanceof L.Marker) {
        setObstacleMarkers((prevMarkers) =>
          prevMarkers.filter((obstacle) => obstacle.layerId !== id)
        );
        return;
      }

      setRoofElements((prevElements) =>
        prevElements.filter((element) => element.layerId !== id)
      );
    });
  }, []);

  const setupMapIfNeeded = useCallback(() => {
    if (!coordinates || !mapContainerRef.current) {
      return;
    }

    if (!mapRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      }).setView([coordinates.lat, coordinates.lng], 20);

      const esriImagery = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 21,
          attribution:
            "Tiles &copy; Esri, Maxar, Earthstar Geographics, and contributors",
        }
      );

      const osmStreets = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap contributors",
        }
      );

      esriImagery.addTo(map);
      L.control
        .layers(
          {
            "Satellite (Esri)": esriImagery,
            OpenStreetMap: osmStreets,
          },
          undefined,
          { position: "topright" }
        )
        .addTo(map);

      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      mapRef.current = map;
      featureGroupRef.current = drawnItems;
    }

    mapRef.current.setView([coordinates.lat, coordinates.lng], 20);

    if (locationMarkerRef.current) {
      mapRef.current.removeLayer(locationMarkerRef.current);
    }

    const locationMarker = L.circleMarker([coordinates.lat, coordinates.lng], {
      radius: 6,
      color: "#00d3a7",
      fillColor: "#00d3a7",
      fillOpacity: 0.8,
    });

    locationMarker
      .bindTooltip("Selected address", {
        direction: "top",
      })
      .addTo(mapRef.current);

    locationMarkerRef.current = locationMarker;

    setTimeout(() => mapRef.current?.invalidateSize(), 100);
  }, [coordinates]);

  const syncDrawTools = useCallback(() => {
    if (!mapRef.current || !featureGroupRef.current) {
      return;
    }

    const map = mapRef.current;

    if (showMapTools && !drawControlRef.current) {
      const drawControl = new (L.Control as any).Draw({
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
          featureGroup: featureGroupRef.current,
          remove: true,
        },
      });

      map.addControl(drawControl);
      map.on((L as any).Draw.Event.CREATED, handleDrawCreated);
      map.on((L as any).Draw.Event.EDITED, handleDrawEdited);
      map.on((L as any).Draw.Event.DELETED, handleDrawDeleted);
      drawControlRef.current = drawControl;
      return;
    }

    if (!showMapTools && drawControlRef.current) {
      map.removeControl(drawControlRef.current);
      map.off((L as any).Draw.Event.CREATED, handleDrawCreated);
      map.off((L as any).Draw.Event.EDITED, handleDrawEdited);
      map.off((L as any).Draw.Event.DELETED, handleDrawDeleted);
      drawControlRef.current = null;
    }
  }, [handleDrawCreated, handleDrawDeleted, handleDrawEdited, showMapTools]);

  useEffect(() => {
    setupMapIfNeeded();
  }, [setupMapIfNeeded]);

  useEffect(() => {
    syncDrawTools();
  }, [syncDrawTools]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
  }, []);

  const searchAddress = async () => {
    const query = address.trim();
    if (!query) {
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
          query
        )}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to search address");
      }

      const data = (await response.json()) as NominatimResult[];
      setSearchResults(data);

      if (data.length === 1) {
        const [singleResult] = data;
        selectAddress(singleResult);
      }
    } catch (error) {
      console.error("Address search failed", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectAddress = (result: NominatimResult) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }

    setAddress(result.display_name);
    setSelectedAddress(result.display_name);
    setCoordinates({ lat, lng });
    setSearchResults([]);
  };

  const exportRoofData = () => {
    const data = {
      type: "FeatureCollection",
      features: [
        ...roofElements.map((element) => ({
          ...element.geoJSON,
          properties: {
            ...(element.geoJSON.properties ?? {}),
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
            type: marker.type,
            label: marker.label,
          },
        })),
      ],
    };

    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "roof_data.geojson");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <div
      className="app-container"
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      <div
        className="sidebar"
        style={{
          width: "340px",
          backgroundColor: "#383c4a",
          color: "#fff",
          padding: "20px",
          overflowY: "auto",
          boxShadow: "2px 0 5px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ marginBottom: "25px", textAlign: "center" }}>
          <h1 style={{ margin: "0 0 5px 0", color: "#5294e2" }}>Roof Capture</h1>
          <p style={{ color: "#7c818c", fontSize: "14px", margin: "0" }}>
            Free map stack: OpenStreetMap + open imagery
          </p>
        </div>

        <div className="sidebar-section" style={{ marginBottom: "20px" }}>
          <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>Location Search</h3>
          <label
            htmlFor="address"
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "14px",
              color: "#7c818c",
            }}
          >
            Address
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  searchAddress();
                }
              }}
              placeholder="Search with OpenStreetMap geocoder"
              style={{
                width: "100%",
                padding: "10px",
                border: "none",
                borderRadius: "4px",
                backgroundColor: "#404552",
                color: "#fff",
              }}
            />
            <button
              onClick={searchAddress}
              disabled={isSearching}
              style={{
                padding: "10px 14px",
                backgroundColor: "#5294e2",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: isSearching ? "not-allowed" : "pointer",
                opacity: isSearching ? 0.7 : 1,
              }}
            >
              {isSearching ? "..." : "Find"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div
              style={{
                marginTop: "10px",
                borderRadius: "6px",
                overflow: "hidden",
                border: "1px solid #4b5162",
              }}
            >
              {searchResults.map((result) => (
                <button
                  key={`${result.lat}-${result.lon}-${result.display_name}`}
                  onClick={() => selectAddress(result)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px",
                    border: "none",
                    borderBottom: "1px solid #4b5162",
                    backgroundColor: "#404552",
                    color: "#dcdfe4",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedAddress && coordinates && (
          <div className="sidebar-section" style={{ marginBottom: "20px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>Selected Location</h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "12px",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              <p style={{ margin: "0 0 6px 0" }}>{selectedAddress}</p>
              <p style={{ margin: 0, color: "#9da3b3", fontSize: "12px" }}>
                {coordinates.lat.toFixed(6)}, {coordinates.lng.toFixed(6)}
              </p>
            </div>
          </div>
        )}

        {coordinates && (
          <div className="sidebar-section" style={{ marginBottom: "20px" }}>
            <button
              onClick={() => setShowMapTools((prev) => !prev)}
              style={{
                width: "100%",
                padding: "12px",
                backgroundColor: showMapTools ? "#4b5162" : "#5294e2",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              {showMapTools ? "Disable Draw Tools" : "Enable Roof Tracing"}
            </button>
          </div>
        )}

        {showMapTools && (
          <div className="sidebar-section" style={{ marginBottom: "20px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>Drawing Tools</h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "12px",
                borderRadius: "4px",
                fontSize: "14px",
              }}
            >
              <p style={{ margin: "0 0 8px 0", fontWeight: "bold" }}>Instructions:</p>
              <ul style={{ margin: 0, paddingLeft: "20px", color: "#dcdfe4" }}>
                <li style={{ marginBottom: "7px" }}>Polygon/Rectangle for roof outlines</li>
                <li style={{ marginBottom: "7px" }}>Circle for circular roof features</li>
                <li style={{ marginBottom: "7px" }}>Polyline for edges and ridges</li>
                <li style={{ marginBottom: "7px" }}>Marker for rooftop obstacles</li>
              </ul>
            </div>
          </div>
        )}

        {showMapTools && (
          <div className="sidebar-section" style={{ marginBottom: "20px" }}>
            <h3 style={{ color: "#5294e2", marginBottom: "10px" }}>Element Summary</h3>
            <div
              style={{
                backgroundColor: "#4b5162",
                padding: "12px",
                borderRadius: "4px",
              }}
            >
              <p style={{ margin: "0 0 6px 0", fontWeight: "bold" }}>
                Roof Elements: {roofElements.length}
              </p>
              <ul style={{ margin: "0 0 8px 0", paddingLeft: "20px", fontSize: "14px" }}>
                <li>
                  Polygons/Rectangles:{" "}
                  {
                    roofElements.filter(
                      (el) => el.type === "polygon" || el.type === "rectangle"
                    ).length
                  }
                </li>
                <li>Circles: {roofElements.filter((el) => el.type === "circle").length}</li>
                <li>Lines: {roofElements.filter((el) => el.type === "polyline").length}</li>
              </ul>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                Obstacles: {obstacleMarkers.length}
              </p>
            </div>
          </div>
        )}

        {showMapTools && (
          <button
            onClick={exportRoofData}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#5294e2",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Export Data (GeoJSON)
          </button>
        )}
      </div>

      <div
        className="main-content"
        style={{
          flex: 1,
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
              textAlign: "center",
              maxWidth: "560px",
              margin: "0 auto",
            }}
          >
            <h2 style={{ color: "#5294e2", marginBottom: "14px" }}>
              Open-Source Map Ready
            </h2>
            <p style={{ lineHeight: 1.6 }}>
              Search an address with the OpenStreetMap geocoder. Once selected,
              the map centers there with high-quality imagery and optional roof
              tracing tools.
            </p>
          </div>
        )}

        {coordinates && (
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
              <h2 style={{ margin: 0, color: "#5294e2" }}>Map View</h2>
              <p style={{ margin: 0, color: "#9da3b3", fontSize: "14px" }}>
                Use the layer switcher (top-right) to swap imagery and OSM.
              </p>
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
