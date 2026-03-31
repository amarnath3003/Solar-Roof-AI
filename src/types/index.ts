export type ViewMode = "normal" | "satellite";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface RoofElement {
  id: number;
  layerId: number;
  type: string;
  geoJSON: GeoJSON.Feature;
  style: {
    color: string;
  };
}

export interface ObstacleMarker {
  id: number;
  layerId: number;
  type: "obstacle";
  position: [number, number];
  label: string;
}
