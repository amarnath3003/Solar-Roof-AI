from pydantic import BaseModel, Field, model_validator


class Coordinates(BaseModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)


class MapBounds(BaseModel):
    west: float = Field(ge=-180.0, le=180.0)
    south: float = Field(ge=-90.0, le=90.0)
    east: float = Field(ge=-180.0, le=180.0)
    north: float = Field(ge=-90.0, le=90.0)

    @model_validator(mode="after")
    def validate_extent(self) -> "MapBounds":
        if self.west >= self.east:
            raise ValueError("Bounds must satisfy west < east.")
        if self.south >= self.north:
            raise ValueError("Bounds must satisfy south < north.")
        return self


class DetectionRequest(BaseModel):
    center: Coordinates
    bounds: MapBounds
    snapshot_base64: str = Field(min_length=20)
    width: int = Field(gt=0, le=4096)
    height: int = Field(gt=0, le=4096)
    zoom: float = Field(default=19, ge=0, le=23)
    min_roof_area_px: int = Field(default=500, ge=50)
    min_obstacle_area_px: int = Field(default=35, ge=5)
    roof_confidence_threshold: float = Field(default=0.4, ge=0.0, le=1.0)
    obstacle_confidence_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    min_roof_solidity: float = Field(default=0.72, ge=0.0, le=1.0)
    min_roof_rectangularity: float = Field(default=0.25, ge=0.0, le=1.0)
    simplify_epsilon_ratio: float = Field(default=0.02, ge=0.003, le=0.08)
    max_roof_planes: int = Field(default=12, ge=1, le=50)
    max_obstacles: int = Field(default=40, ge=0, le=200)

    @model_validator(mode="after")
    def validate_detection_parameters(self) -> "DetectionRequest":
        if self.min_obstacle_area_px >= self.min_roof_area_px:
            raise ValueError("min_obstacle_area_px must be smaller than min_roof_area_px.")

        is_center_within_bounds = (
            self.bounds.west <= self.center.lng <= self.bounds.east
            and self.bounds.south <= self.center.lat <= self.bounds.north
        )
        if not is_center_within_bounds:
            raise ValueError("Center coordinate must lie within the provided map bounds.")

        return self


class PolygonGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: list[list[list[float]]]


class PointGeometry(BaseModel):
    type: str = "Point"
    coordinates: list[float]


class RoofPlane(BaseModel):
    id: str
    confidence: float = Field(ge=0.0, le=1.0)
    estimated_pitch_degrees: float = Field(ge=0.0, le=90.0)
    aspect_degrees: float = Field(ge=0.0, le=360.0)
    area_sq_m: float = Field(ge=0.0)
    geometry: PolygonGeometry


class Obstacle(BaseModel):
    id: str
    confidence: float = Field(ge=0.0, le=1.0)
    obstacle_type: str
    estimated_height_m: float = Field(ge=0.0)
    geometry: PointGeometry


class DetectionMetadata(BaseModel):
    processing_ms: int = Field(ge=0)
    roof_candidates: int = Field(ge=0)
    obstacle_candidates: int = Field(ge=0)
    filtered_roof_planes: int = Field(ge=0)
    filtered_obstacles: int = Field(ge=0)
    model: str
    image_quality: float = Field(ge=0.0, le=1.0)
    input_width: int = Field(gt=0)
    input_height: int = Field(gt=0)
    warning_codes: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    estimated_metrics: list[str] = Field(default_factory=list)


class DetectionResponse(BaseModel):
    roof_planes: list[RoofPlane]
    obstacles: list[Obstacle]
    metadata: DetectionMetadata
