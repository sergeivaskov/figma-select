import { getGenericType } from './utils';

export function findSimilarNodes(target: SceneNode, scope: 'page' | 'document' = 'page'): SceneNode[] {
  const similarNodes: SceneNode[] = [];

  // 1. Определяем идентичность целевого узла
  const isTargetInstance = target.type === 'INSTANCE' || target.type === 'COMPONENT';
  let targetMainId: string | null = null;
  let targetSetId: string | null = null;

  if (isTargetInstance) {
    const t = target as any;
    targetMainId = t.type === 'COMPONENT' ? t.id : t.mainComponent?.id;
    targetSetId = t.type === 'COMPONENT' ? 
      (t.parent?.type === 'COMPONENT_SET' ? t.parent.id : null) : 
      (t.mainComponent?.parent?.type === 'COMPONENT_SET' ? t.mainComponent.parent.id : null);
  }

  // 2. Функция для получения структурной сигнатуры (снизу вверх)
  // Сигнатура - это массив обобщенных типов всех родителей вплоть до страницы
  const parentSignatureCache = new Map<string, string[]>();
  
  const getSignature = (node: BaseNode): string[] => {
    if (!node.parent || node.parent.type === 'DOCUMENT') return [];
    
    // Если для прямого родителя уже есть кэш, возвращаем его
    if (parentSignatureCache.has(node.parent.id)) {
      return parentSignatureCache.get(node.parent.id)!;
    }

    const sig: string[] = [];
    let curr: BaseNode | null = node.parent;
    const pathIds: string[] = []; // Запоминаем путь, чтобы закэшировать все промежуточные узлы

    while (curr && curr.type !== 'DOCUMENT') {
      // Если наткнулись на закэшированный узел выше по дереву
      if (parentSignatureCache.has(curr.id)) {
        sig.push(...parentSignatureCache.get(curr.id)!);
        break;
      }
      
      sig.push(getGenericType(curr.type));
      pathIds.push(curr.id);
      
      if (curr.type === 'PAGE') break;
      curr = curr.parent;
    }

    // Кэшируем результаты для всех пройденных узлов
    for (let i = 0; i < pathIds.length; i++) {
      parentSignatureCache.set(pathIds[i], sig.slice(i));
    }

    return sig;
  };

  const targetSignature = getSignature(target);

  // 3. Определяем область поиска (чтобы не выходить за пределы текущего экрана, если scope === 'page')
  let searchRoots: readonly BaseNode[] = [];
  if (scope === 'document') {
    searchRoots = figma.root.children;
  } else {
    // Ищем корневой фрейм (Screen/Artboard) для текущего узла
    let topLevelNode: BaseNode | null = target;
    while (topLevelNode && topLevelNode.parent && topLevelNode.parent.type !== 'PAGE') {
      topLevelNode = topLevelNode.parent;
    }
    
    if (topLevelNode && 'findAllWithCriteria' in topLevelNode) {
      searchRoots = [topLevelNode];
    } else {
      searchRoots = [figma.currentPage];
    }
  }

  // 4. Ищем и фильтруем кандидатов
  for (const root of searchRoots) {
    if (!('findAllWithCriteria' in root)) continue;
    
    const searchContainer = root as any;
    let candidates: SceneNode[] = [];
    
    // Используем быстрый поиск Figma API
    if (isTargetInstance) {
      candidates = searchContainer.findAllWithCriteria({ types: ['INSTANCE', 'COMPONENT'] });
    } else {
      candidates = searchContainer.findAllWithCriteria({ types: [target.type as any] });
    }

    for (const candidate of candidates) {
      if (candidate.id === target.id) continue;

      // 1. Быстрая проверка структурной вложенности (сигнатуры) СНАЧАЛА
      // Это работает мгновенно благодаря кэшу и отсекает 99% неподходящих узлов
      const candSignature = getSignature(candidate);
      
      // Длина пути до страницы должна совпадать
      if (candSignature.length !== targetSignature.length) continue;
      
      // Все типы контейнеров на пути должны совпадать
      let isStructureMatch = true;
      for (let i = 0; i < targetSignature.length; i++) {
        if (candSignature[i] !== targetSignature[i]) {
          isStructureMatch = false;
          break;
        }
      }

      if (!isStructureMatch) continue;

      // 2. Проверка идентичности самого узла (только для тех, кто прошел структурный фильтр)
      // Мы делаем тяжелые вызовы API (чтение name, mainComponent) только для единиц слоев
      let isIdentityMatch = false;
      if (isTargetInstance) {
        const c = candidate as any;
        const mainId = c.type === 'COMPONENT' ? c.id : c.mainComponent?.id;
        const setId = c.type === 'COMPONENT' ? 
          (c.parent?.type === 'COMPONENT_SET' ? c.parent.id : null) : 
          (c.mainComponent?.parent?.type === 'COMPONENT_SET' ? c.mainComponent.parent.id : null);
        
        if ((targetMainId && targetMainId === mainId) || (targetSetId && targetSetId === setId)) {
          isIdentityMatch = true;
        } else if (candidate.name === target.name) {
          isIdentityMatch = true; // Фолбэк по имени
        }
      } else {
        if (candidate.name === target.name) {
          isIdentityMatch = true;
        }
      }

      if (isIdentityMatch) {
        similarNodes.push(candidate);
      }
    }
  }

  return similarNodes;
}
