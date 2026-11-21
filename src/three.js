// Sweet Home — only the parts of three.js the 3D scene uses. Importing all of three.js (`import * as THREE`) put
// the whole library (about 670 KB) in the card; with these names the bundler leaves the rest out. A three.js class
// newly used in scene.js (as T.Something) must be added here.
import {
  ACESFilmicToneMapping, AdditiveBlending, AlwaysStencilFunc, BackSide, Box3, BoxGeometry, BufferAttribute,
  BufferGeometry, CanvasTexture, CircleGeometry, Clock, Color, ConeGeometry, CylinderGeometry, DirectionalLight,
  DoubleSide, EqualStencilFunc, ExtrudeGeometry, Float32BufferAttribute, Group, HemisphereLight, KeepStencilOp,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  PCFSoftShadowMap, Path, PerspectiveCamera, Plane, PlaneGeometry, PointLight, Points, PointsMaterial, Raycaster,
  RepeatWrapping, ReplaceStencilOp, RingGeometry, SRGBColorSpace, Scene, ShadowMaterial, Shape, ShapeGeometry,
  SphereGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';

export const THREE_LIB = {
  ACESFilmicToneMapping, AdditiveBlending, AlwaysStencilFunc, BackSide, Box3, BoxGeometry, BufferAttribute,
  BufferGeometry, CanvasTexture, CircleGeometry, Clock, Color, ConeGeometry, CylinderGeometry, DirectionalLight,
  DoubleSide, EqualStencilFunc, ExtrudeGeometry, Float32BufferAttribute, Group, HemisphereLight, KeepStencilOp,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  PCFSoftShadowMap, Path, PerspectiveCamera, Plane, PlaneGeometry, PointLight, Points, PointsMaterial, Raycaster,
  RepeatWrapping, ReplaceStencilOp, RingGeometry, SRGBColorSpace, Scene, ShadowMaterial, Shape, ShapeGeometry,
  SphereGeometry, Vector2, Vector3, WebGLRenderer,
};
