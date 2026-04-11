export function getGenericType(type: string): string {
  if (['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(type)) return 'COMPONENT_LIKE';
  if (['FRAME', 'GROUP', 'SECTION'].includes(type)) return 'FRAME_LIKE';
  if (['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'BOOLEAN_OPERATION', 'LINE'].includes(type)) return 'SHAPE';
  return type;
}

export interface PathNode {
  id: string;
  type: string;
  name: string;
  index: number;
}

export function getPathToPage(node: BaseNode): PathNode[] {
  const path: PathNode[] = [];
  let current: BaseNode | null = node;
  
  while (current) {
    let index = 0;
    if (current.parent && 'children' in current.parent) {
      index = (current.parent as any).children.findIndex((c: any) => c.id === current!.id);
    }
    
    path.unshift({
      id: current.id,
      type: getGenericType(current.type),
      name: current.name,
      index: index
    });
    
    if (current.type === 'PAGE') {
      break;
    }
    current = current.parent as BaseNode;
  }
  return path;
}
