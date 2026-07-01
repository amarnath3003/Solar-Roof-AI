"""Local ML roof-detection package.

Replaces the external Roboflow dependency with an in-house instance-segmentation
model plus a polygon regularizer that turns raster masks into clean,
vector-like straight-line roof outlines.
"""
