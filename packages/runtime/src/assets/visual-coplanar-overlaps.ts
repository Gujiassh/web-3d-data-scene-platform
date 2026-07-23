import {
  BatchedMesh,
  InstancedMesh,
  Mesh,
  SkinnedMesh,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

const COORDINATE_PRECISION = 1e-6;
const OVERLAP_AREA_EPSILON = 1e-12;
const MIN_COPLANAR_COVERAGE = 0.95;

export interface VisualCoplanarOverlapResult {
  readonly suppressedTriangles: number;
  readonly offsetTriangles: number;
  readonly affectedMeshes: number;
}

interface CandidateMesh {
  readonly mesh: Mesh;
  readonly nodeIndex: number;
  readonly material: Material;
  readonly geometry: BufferGeometry;
  readonly elementCount: number;
  readonly animationSignature: string;
}

interface TriangleOwner {
  readonly nodeIndex: number;
}

interface MeshSuppression {
  readonly candidate: CandidateMesh;
  readonly hiddenFaces: Set<number>;
  readonly offsetFaces: Set<number>;
}

interface TriangleRecord {
  readonly candidate: CandidateMesh;
  readonly faceIndex: number;
  readonly hidden: boolean;
  readonly projected: ProjectedTriangle;
  readonly bounds: ProjectedBounds;
}

type ProjectedPoint = readonly [number, number];
type ProjectedTriangle = readonly [ProjectedPoint, ProjectedPoint, ProjectedPoint];

interface ProjectedBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export function resolveVisualCoplanarOverlaps(
  visualRoot: Object3D,
  nodesByIndex: ReadonlyMap<number, Object3D>,
  nodeIndexByObject: ReadonlyMap<Object3D, number>,
  gltfJson: unknown,
): VisualCoplanarOverlapResult {
  visualRoot.updateWorldMatrix(true, true);
  const formalIndexByObject = new Map(
    [...nodesByIndex].map(([nodeIndex, object]) => [object, nodeIndex] as const),
  );
  const animatedNodes = collectAnimatedNodes(gltfJson);
  const candidates: CandidateMesh[] = [];
  visualRoot.traverse((object) => {
    const candidate = classifyCandidate(
      object,
      visualRoot,
      nodesByIndex,
      nodeIndexByObject,
      formalIndexByObject,
      animatedNodes,
    );
    if (candidate !== null) candidates.push(candidate);
  });

  const materials = new Map<Material, Map<string, Map<string, TriangleOwner>>>();
  const suppressions = new Map<Mesh, MeshSuppression>();
  const coplanarGroups = new Map<string, TriangleRecord[]>();
  const pointA = new Vector3();
  const pointB = new Vector3();
  const pointC = new Vector3();
  for (const candidate of candidates) {
    const byAnimation = getOrCreate(materials, candidate.material, () => new Map());
    const triangles = getOrCreate(byAnimation, candidate.animationSignature, () => new Map());
    for (let faceIndex = 0; faceIndex < candidate.elementCount / 3; faceIndex += 1) {
      readWorldTriangle(candidate, faceIndex, pointA, pointB, pointC);
      if (!isFiniteNondegenerateTriangle(pointA, pointB, pointC)) continue;
      const key = orientedTriangleKey(pointA, pointB, pointC);
      if (key === null) continue;
      const owner = triangles.get(key);
      let hidden = false;
      if (owner === undefined) {
        triangles.set(key, { nodeIndex: candidate.nodeIndex });
      } else if (owner.nodeIndex !== candidate.nodeIndex) {
        const suppression = getOrCreate(suppressions, candidate.mesh, () => ({
          candidate,
          hiddenFaces: new Set(),
          offsetFaces: new Set(),
        }));
        suppression.hiddenFaces.add(faceIndex);
        hidden = true;
      }
      const plane = canonicalPlane(pointA, pointB, pointC);
      if (plane === null) continue;
      const projected = projectTriangle(pointA, pointB, pointC, plane.projectionAxis);
      const groupKey = `${candidate.animationSignature}|${plane.key}`;
      getOrCreate(coplanarGroups, groupKey, () => []).push({
        candidate,
        faceIndex,
        hidden,
        projected,
        bounds: projectedBounds(projected),
      });
    }
  }

  const priorities = markCoplanarRenderPriority(coplanarGroups, suppressions);

  const replacedGeometries = new Set<BufferGeometry>();
  let suppressedTriangles = 0;
  let offsetTriangles = 0;
  for (const { candidate, hiddenFaces, offsetFaces } of suppressions.values()) {
    if (hiddenFaces.size === 0 && offsetFaces.size === 0) continue;
    const geometry = candidate.geometry.clone();
    geometry.clearGroups();
    addMaterialGroups(geometry, candidate.elementCount, hiddenFaces, offsetFaces);
    const hiddenMaterial = candidate.material.clone();
    hiddenMaterial.visible = false;
    const offsetMaterial = candidate.material.clone();
    const priority = priorities.get(candidate.mesh) ?? 1;
    offsetMaterial.polygonOffset = true;
    offsetMaterial.polygonOffsetFactor = priority;
    offsetMaterial.polygonOffsetUnits = priority;
    candidate.mesh.geometry = geometry;
    candidate.mesh.material = [candidate.material, hiddenMaterial, offsetMaterial];
    replacedGeometries.add(candidate.geometry);
    suppressedTriangles += hiddenFaces.size;
    offsetTriangles += offsetFaces.size;
  }
  disposeDetachedGeometries(assetRoot(visualRoot), replacedGeometries);

  return Object.freeze({
    suppressedTriangles,
    offsetTriangles,
    affectedMeshes: suppressions.size,
  });
}

function classifyCandidate(
  object: Object3D,
  visualRoot: Object3D,
  nodesByIndex: ReadonlyMap<number, Object3D>,
  nodeIndexByObject: ReadonlyMap<Object3D, number>,
  formalIndexByObject: ReadonlyMap<Object3D, number>,
  animatedNodes: ReadonlySet<number>,
): CandidateMesh | null {
  if (
    !(object instanceof Mesh) ||
    object instanceof SkinnedMesh ||
    object instanceof InstancedMesh ||
    object instanceof BatchedMesh ||
    Array.isArray(object.material)
  ) {
    return null;
  }
  const geometry = object.geometry;
  const position = geometry.getAttribute("position");
  const elementCount = geometry.index?.count ?? position?.count ?? 0;
  if (
    position === undefined ||
    position.itemSize < 3 ||
    elementCount === 0 ||
    elementCount % 3 !== 0 ||
    geometry.groups.length !== 0 ||
    geometry.drawRange.start !== 0 ||
    (geometry.drawRange.count !== Infinity && geometry.drawRange.count < elementCount) ||
    Object.values(geometry.morphAttributes).some(
      (attributes) => Array.isArray(attributes) && attributes.length > 0,
    )
  ) {
    return null;
  }
  if (geometry.index !== null) {
    for (let offset = 0; offset < geometry.index.count; offset += 1) {
      const index = geometry.index.getX(offset);
      if (!Number.isSafeInteger(index) || index < 0 || index >= position.count) return null;
    }
  }

  const nodeIndex = nodeIndexByObject.get(object);
  const formalNode = nodeIndex === undefined ? undefined : nodesByIndex.get(nodeIndex);
  if (nodeIndex === undefined || formalNode === undefined || !isWithin(formalNode, visualRoot)) {
    return null;
  }
  const animationSignature = animationAncestorSignature(
    formalNode,
    visualRoot,
    formalIndexByObject,
    animatedNodes,
  );
  return {
    mesh: object,
    nodeIndex,
    material: object.material,
    geometry,
    elementCount,
    animationSignature,
  };
}

function animationAncestorSignature(
  object: Object3D,
  visualRoot: Object3D,
  formalIndexByObject: ReadonlyMap<Object3D, number>,
  animatedNodes: ReadonlySet<number>,
): string {
  const indexes: number[] = [];
  for (let current: Object3D | null = object; current !== null; current = current.parent) {
    const nodeIndex = formalIndexByObject.get(current);
    if (nodeIndex !== undefined && animatedNodes.has(nodeIndex)) indexes.push(nodeIndex);
    if (current === visualRoot) break;
  }
  return indexes.reverse().join(",");
}

function collectAnimatedNodes(value: unknown): ReadonlySet<number> {
  const result = new Set<number>();
  if (!isRecord(value) || !Array.isArray(value.animations)) return result;
  for (const animation of value.animations) {
    if (!isRecord(animation) || !Array.isArray(animation.channels)) continue;
    for (const channel of animation.channels) {
      if (!isRecord(channel) || !isRecord(channel.target)) continue;
      const nodeIndex = channel.target.node;
      if (Number.isSafeInteger(nodeIndex) && (nodeIndex as number) >= 0) {
        result.add(nodeIndex as number);
      }
    }
  }
  return result;
}

function readWorldTriangle(
  candidate: CandidateMesh,
  faceIndex: number,
  pointA: Vector3,
  pointB: Vector3,
  pointC: Vector3,
): void {
  const offset = faceIndex * 3;
  const index = candidate.geometry.index;
  const a = index?.getX(offset) ?? offset;
  const b = index?.getX(offset + 1) ?? offset + 1;
  const c = index?.getX(offset + 2) ?? offset + 2;
  const position = candidate.geometry.getAttribute("position")!;
  pointA.fromBufferAttribute(position, a).applyMatrix4(candidate.mesh.matrixWorld);
  pointB.fromBufferAttribute(position, b).applyMatrix4(candidate.mesh.matrixWorld);
  pointC.fromBufferAttribute(position, c).applyMatrix4(candidate.mesh.matrixWorld);
}

function isFiniteNondegenerateTriangle(a: Vector3, b: Vector3, c: Vector3): boolean {
  if (![a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(Number.isFinite)) return false;
  return edgeAB.copy(b).sub(a).cross(edgeAC.copy(c).sub(a)).lengthSq() > 1e-24;
}

const edgeAB = new Vector3();
const edgeAC = new Vector3();

function orientedTriangleKey(a: Vector3, b: Vector3, c: Vector3): string | null {
  const coordinates = [quantizedPoint(a), quantizedPoint(b), quantizedPoint(c)] as const;
  if (isDegenerateQuantizedTriangle(coordinates)) return null;
  const points = coordinates.map((point) => point.join(","));
  const rotations = [
    `${points[0]}|${points[1]}|${points[2]}`,
    `${points[1]}|${points[2]}|${points[0]}`,
    `${points[2]}|${points[0]}|${points[1]}`,
  ];
  rotations.sort();
  return rotations[0]!;
}

function quantizedPoint(point: Vector3): readonly [number, number, number] {
  return [point.x, point.y, point.z].map((value) => Math.round(value / COORDINATE_PRECISION)) as [
    number,
    number,
    number,
  ];
}

function isDegenerateQuantizedTriangle(
  points: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ],
): boolean {
  const [a, b, c] = points;
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return cross.every((value) => value === 0);
}

function addMaterialGroups(
  geometry: BufferGeometry,
  elementCount: number,
  hiddenFaces: ReadonlySet<number>,
  offsetFaces: ReadonlySet<number>,
): void {
  let groupStart = 0;
  let materialIndex = faceMaterialIndex(0, hiddenFaces, offsetFaces);
  for (let offset = 3; offset < elementCount; offset += 3) {
    const nextMaterialIndex = faceMaterialIndex(offset / 3, hiddenFaces, offsetFaces);
    if (nextMaterialIndex === materialIndex) continue;
    geometry.addGroup(groupStart, offset - groupStart, materialIndex);
    groupStart = offset;
    materialIndex = nextMaterialIndex;
  }
  geometry.addGroup(groupStart, elementCount - groupStart, materialIndex);
}

function faceMaterialIndex(
  faceIndex: number,
  hiddenFaces: ReadonlySet<number>,
  offsetFaces: ReadonlySet<number>,
): 0 | 1 | 2 {
  if (hiddenFaces.has(faceIndex)) return 1;
  return offsetFaces.has(faceIndex) ? 2 : 0;
}

function markCoplanarRenderPriority(
  groups: ReadonlyMap<string, readonly TriangleRecord[]>,
  suppressions: Map<Mesh, MeshSuppression>,
): ReadonlyMap<Mesh, number> {
  const predecessors = new Map<Mesh, Set<Mesh>>();
  for (const triangles of groups.values()) {
    const sorted = triangles
      .flatMap((triangle, order) => (triangle.hidden ? [] : [{ triangle, order }]))
      .sort((left, right) => left.triangle.bounds.minX - right.triangle.bounds.minX);
    const active: typeof sorted = [];
    for (const current of sorted) {
      for (let index = active.length - 1; index >= 0; index -= 1) {
        if (active[index]!.triangle.bounds.maxX <= current.triangle.bounds.minX) {
          active.splice(index, 1);
        }
      }
      for (const candidate of active) {
        if (!boundsOverlap(candidate.triangle.bounds, current.triangle.bounds)) continue;
        const [left, right] =
          candidate.order < current.order
            ? [candidate.triangle, current.triangle]
            : [current.triangle, candidate.triangle];
        if (left.candidate.nodeIndex === right.candidate.nodeIndex) continue;
        const coverage = triangleOverlapCoverage(left.projected, right.projected);
        if (coverage < MIN_COPLANAR_COVERAGE) continue;
        const suppression = getOrCreate(suppressions, right.candidate.mesh, () => ({
          candidate: right.candidate,
          hiddenFaces: new Set(),
          offsetFaces: new Set(),
        }));
        suppression.offsetFaces.add(right.faceIndex);
        getOrCreate(predecessors, right.candidate.mesh, () => new Set()).add(left.candidate.mesh);
      }
      active.push(current);
    }
  }
  const priorities = new Map<Mesh, number>();
  const priorityFor = (mesh: Mesh): number => {
    const existing = priorities.get(mesh);
    if (existing !== undefined) return existing;
    const parents = [...(predecessors.get(mesh) ?? [])];
    const priority = 1 + Math.max(0, ...parents.map((parent) => priorityFor(parent)));
    priorities.set(mesh, priority);
    return priority;
  };
  for (const parents of predecessors.values()) {
    for (const parent of parents) {
      if (!predecessors.has(parent)) priorities.set(parent, 0);
    }
  }
  predecessors.forEach((_, mesh) => priorityFor(mesh));
  return priorities;
}

function canonicalPlane(
  a: Vector3,
  b: Vector3,
  c: Vector3,
): { readonly key: string; readonly projectionAxis: 0 | 1 | 2 } | null {
  planeNormal.copy(b).sub(a).cross(planeEdge.copy(c).sub(a));
  const length = planeNormal.length();
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  planeNormal.multiplyScalar(1 / length);
  let distance = planeNormal.dot(a);
  const components = [planeNormal.x, planeNormal.y, planeNormal.z, distance];
  const direction = components.find((value) => Math.abs(value) > 1e-12);
  if (direction !== undefined && direction < 0) {
    planeNormal.multiplyScalar(-1);
    distance = -distance;
  }
  const projectionAxis = dominantAxis(planeNormal);
  const key = [planeNormal.x, planeNormal.y, planeNormal.z, distance]
    .map((value) => Math.round(value / COORDINATE_PRECISION))
    .join(",");
  return { key, projectionAxis };
}

const planeNormal = new Vector3();
const planeEdge = new Vector3();

function dominantAxis(normal: Vector3): 0 | 1 | 2 {
  const values = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)] as const;
  if (values[0] >= values[1] && values[0] >= values[2]) return 0;
  return values[1] >= values[2] ? 1 : 2;
}

function projectTriangle(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  omittedAxis: 0 | 1 | 2,
): ProjectedTriangle {
  return [projectPoint(a, omittedAxis), projectPoint(b, omittedAxis), projectPoint(c, omittedAxis)];
}

function projectPoint(point: Vector3, omittedAxis: 0 | 1 | 2): ProjectedPoint {
  if (omittedAxis === 0) return [point.y, point.z];
  if (omittedAxis === 1) return [point.x, point.z];
  return [point.x, point.y];
}

function triangleOverlapCoverage(left: ProjectedTriangle, right: ProjectedTriangle): number {
  let polygon: ProjectedPoint[] = [...left];
  const orientation = signedArea(right) >= 0 ? 1 : -1;
  for (let index = 0; index < 3 && polygon.length > 0; index += 1) {
    polygon = clipPolygon(polygon, right[index]!, right[(index + 1) % 3]!, orientation);
  }
  const overlapArea = Math.abs(signedArea(polygon));
  const targetArea = Math.abs(signedArea(right));
  if (overlapArea <= OVERLAP_AREA_EPSILON || targetArea <= OVERLAP_AREA_EPSILON) return 0;
  return Math.min(1, overlapArea / targetArea);
}

function projectedBounds(triangle: ProjectedTriangle): ProjectedBounds {
  const xs = triangle.map((point) => point[0]);
  const ys = triangle.map((point) => point[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function boundsOverlap(left: ProjectedBounds, right: ProjectedBounds): boolean {
  return !(
    left.maxX <= right.minX ||
    right.maxX <= left.minX ||
    left.maxY <= right.minY ||
    right.maxY <= left.minY
  );
}

function clipPolygon(
  polygon: readonly ProjectedPoint[],
  edgeStart: ProjectedPoint,
  edgeEnd: ProjectedPoint,
  orientation: 1 | -1,
): ProjectedPoint[] {
  const output: ProjectedPoint[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const currentInside = insideEdge(current, edgeStart, edgeEnd, orientation);
    const previousInside = insideEdge(previous, edgeStart, edgeEnd, orientation);
    if (currentInside !== previousInside) {
      const intersection = lineIntersection(previous, current, edgeStart, edgeEnd);
      if (intersection !== null) output.push(intersection);
    }
    if (currentInside) output.push(current);
  }
  return output;
}

function insideEdge(
  point: ProjectedPoint,
  edgeStart: ProjectedPoint,
  edgeEnd: ProjectedPoint,
  orientation: 1 | -1,
): boolean {
  const cross =
    (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1]) -
    (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0]);
  return orientation * cross >= -OVERLAP_AREA_EPSILON;
}

function lineIntersection(
  start: ProjectedPoint,
  end: ProjectedPoint,
  edgeStart: ProjectedPoint,
  edgeEnd: ProjectedPoint,
): ProjectedPoint | null {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const edgeX = edgeEnd[0] - edgeStart[0];
  const edgeY = edgeEnd[1] - edgeStart[1];
  const denominator = segmentX * edgeY - segmentY * edgeX;
  if (Math.abs(denominator) <= Number.EPSILON) return null;
  const offsetX = edgeStart[0] - start[0];
  const offsetY = edgeStart[1] - start[1];
  const ratio = (offsetX * edgeY - offsetY * edgeX) / denominator;
  return [start[0] + ratio * segmentX, start[1] + ratio * segmentY];
}

function signedArea(points: readonly ProjectedPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function disposeDetachedGeometries(
  root: Object3D,
  replacedGeometries: ReadonlySet<BufferGeometry>,
): void {
  if (replacedGeometries.size === 0) return;
  const retained = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof Mesh) retained.add(object.geometry);
  });
  for (const geometry of replacedGeometries) {
    if (!retained.has(geometry)) geometry.dispose();
  }
}

function assetRoot(object: Object3D): Object3D {
  let root = object;
  while (root.parent !== null) root = root.parent;
  return root;
}

function isWithin(object: Object3D, root: Object3D): boolean {
  for (let current: Object3D | null = object; current !== null; current = current.parent) {
    if (current === root) return true;
  }
  return false;
}

function getOrCreate<Key, Value>(map: Map<Key, Value>, key: Key, create: () => Value): Value {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  map.set(key, value);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
