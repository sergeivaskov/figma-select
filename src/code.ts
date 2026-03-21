// 1. Определение обобщенного типа узла для гибкого сравнения
function getGenericType(type: string): string {
  if (['COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(type)) return 'COMPONENT_LIKE';
  if (['FRAME', 'GROUP', 'SECTION'].includes(type)) return 'FRAME_LIKE';
  if (['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'BOOLEAN_OPERATION', 'LINE'].includes(type)) return 'SHAPE';
  return type;
}

interface PathNode {
  id: string;
  type: string;
  index: number;
}

// 2. Получение пути от страницы до узла
function getPathToPage(node: BaseNode): PathNode[] {
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
      index: index
    });
    
    if (current.type === 'PAGE') {
      break;
    }
    current = current.parent as BaseNode;
  }
  return path;
}

// 3. Основная логика поиска подобных слоев
function findSimilarNodes(target: SceneNode): SceneNode[] {
  const targetPath = getPathToPage(target);
  const n = targetPath.length - 1;
  const similarNodes: SceneNode[] = [];

  function traverse(node: BaseNode, depth: number, index: number, k: number) {
    const targetSeg = targetPath[depth];
    let next_k = k;

    if (k === -1) {
      // Мы все еще на пути предков исходного узла
      if (node.id === targetSeg.id) {
        next_k = -1;
      } else {
        // ТОЧКА РАСХОЖДЕНИЯ (переход в соседнюю ветку)
        
        // Универсальное математическое правило:
        // Мы запрещаем расхождение на двух последних уровнях.
        // 1. depth === n: Запрещает выделять сестринские элементы самого целевого узла (соседей внутри его прямого родителя).
        // 2. depth === n - 1: Запрещает выделять элементы в сестринских группах внутри родителя родителя.
        // Это гарантирует, что мы ищем "подобные структуры" как минимум на уровне дедушки.
        // Мы не смотрим на типы (компоненты/фреймы), мы смотрим только на структуру дерева.
        
        if (depth >= n - 1) {
          return; 
        }

        if (getGenericType(node.type) === targetSeg.type) {
          next_k = depth;
        } else {
          return; 
        }
      }
    } else {
      // Мы ниже точки расхождения (внутри найденного подобного контейнера)
      // Здесь мы СТРОГО проверяем совпадение индекса и типа
      if (getGenericType(node.type) === targetSeg.type && index === targetSeg.index) {
        next_k = k;
      } else {
        return; 
      }
    }

    // Если достигли нужной глубины
    if (depth === n) {
      if (node.id !== target.id && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
        similarNodes.push(node as SceneNode);
      }
      return;
    }

    // Продолжаем обход дочерних элементов
    if ('children' in node) {
      const children = (node as any).children;
      
      if (next_k !== -1) {
        // Идем строго по нужному индексу
        const requiredIndex = targetPath[depth + 1].index;
        if (requiredIndex >= 0 && requiredIndex < children.length) {
          traverse(children[requiredIndex], depth + 1, requiredIndex, next_k);
        }
      } else {
        // Проверяем всех детей
        for (let i = 0; i < children.length; i++) {
          traverse(children[i], depth + 1, i, next_k);
        }
      }
    }
  }

  traverse(figma.currentPage, 0, 0, -1);

  return similarNodes;
}

// 4. Главная функция плагина
function main() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Пожалуйста, выделите один слой для поиска подобных.');
    figma.closePlugin();
    return;
  }

  if (selection.length > 1) {
    figma.notify('Выделено несколько слоев. Пожалуйста, оставьте только один.');
    figma.closePlugin();
    return;
  }

  const targetNode = selection[0];

  const similarNodes = findSimilarNodes(targetNode);

  if (similarNodes.length === 0) {
    figma.notify('Подобных слоев не найдено.');
  } else {
    figma.currentPage.selection = [targetNode, ...similarNodes];
    figma.notify(`Выделено подобных слоев: ${similarNodes.length}`);
  }

  figma.closePlugin();
}

main();