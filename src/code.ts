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
        // ТОЧКА РАСХОЖДЕНИЯ
        if (depth >= n) {
          return; 
        }

        if (getGenericType(node.type) === targetSeg.type) {
          next_k = depth;
        } else {
          return; 
        }
      }
    } else {
      // Мы ниже точки расхождения
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

// 4. Логика для выбора дочерних элементов
function selectChild(command: 'select-first-child' | 'select-last-child') {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Пожалуйста, выделите контейнер (Frame, Group, Component и т.д.).');
    figma.closePlugin();
    return;
  }

  const newSelection: SceneNode[] = [];
  let successCount = 0;

  for (const node of selection) {
    if ('children' in node && node.children.length > 0) {
      const children = node.children;
      if (command === 'select-first-child') {
        // Первый ребенок в Figma - это самый нижний слой в панели слоев.
        // Если пользователь ожидает "первый визуально" (верхний в панели), то это последний элемент массива.
        // Но обычно "First Child" означает индекс 0.
        newSelection.push(children[0] as SceneNode);
      } else {
        newSelection.push(children[children.length - 1] as SceneNode);
      }
      successCount++;
    } else {
      // Если у узла нет детей, оставляем его выделенным, чтобы не сбрасывать выделение полностью
      newSelection.push(node);
    }
  }

  if (successCount > 0) {
    figma.currentPage.selection = newSelection;
    figma.notify(`Выделено дочерних элементов: ${successCount}`);
  } else {
    figma.notify('У выделенных элементов нет дочерних слоев.');
  }

  figma.closePlugin();
}

// 5. Логика для скрытия всех инстансов
async function hideAllInstances() {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    figma.notify('Пожалуйста, выделите один мастер-компонент или инстанс.');
    figma.closePlugin();
    return;
  }

  const node = selection[0];
  let componentId: string | undefined;
  let componentSetId: string | undefined;

  if (node.type === 'COMPONENT') {
    componentId = node.id;
    if (node.parent && node.parent.type === 'COMPONENT_SET') {
      componentSetId = node.parent.id;
    }
  } else if (node.type === 'INSTANCE') {
    componentId = node.mainComponent?.id;
    if (node.mainComponent?.parent?.type === 'COMPONENT_SET') {
      componentSetId = node.mainComponent.parent.id;
    }
  }

  if (!componentId) {
    figma.notify('Выделенный элемент не является мастер-компонентом или инстансом.');
    figma.closePlugin();
    return;
  }

  // Определяем, находится ли выделенный элемент внутри мастер-компонента
  let containingMasterNode: ComponentNode | ComponentSetNode | null = null;
  let currNode: BaseNode | null = node.parent;
  while (currNode && currNode.type !== 'PAGE' && currNode.type !== 'DOCUMENT') {
    if (currNode.type === 'COMPONENT' || currNode.type === 'COMPONENT_SET') {
      containingMasterNode = currNode as ComponentNode | ComponentSetNode;
    }
    currNode = currNode.parent;
  }

  // Показываем начальное уведомление о поиске
  let notification = figma.notify('Поиск инстансов...', { timeout: 100000 });

  // Даем UI обновиться перед тяжелой операцией
  await new Promise(resolve => setTimeout(resolve, 10));

  // Используем findAllWithCriteria для кратного ускорения поиска.
  // Ищем только внутри родительского мастер-компонента (если есть), иначе по всей странице.
  const searchRoot = containingMasterNode ? containingMasterNode : figma.currentPage;
  const allInstances = searchRoot.findAllWithCriteria({ types: ['INSTANCE'] });
  
  // Отфильтруем инстансы.
  const targetInstances = allInstances.filter(i => {
    if (!i.visible) return false; // Пропускаем уже скрытые инстансы
    if (!i.mainComponent) return false;
    
    if (componentSetId && i.mainComponent.parent?.type === 'COMPONENT_SET') {
      return i.mainComponent.parent.id === componentSetId;
    }
    
    return i.mainComponent.id === componentId;
  });

  let hiddenCount = 0;
  const chunkSize = 100; // Обрабатываем по 100 элементов за раз, чтобы не блокировать UI

  for (let i = 0; i < targetInstances.length; i += chunkSize) {
    const chunk = targetInstances.slice(i, i + chunkSize);
    
    for (const instance of chunk) {
      let shouldHide = false;

      if (containingMasterNode) {
        // Мы уже ограничили поиск рамками containingMasterNode, 
        // поэтому все найденные инстансы гарантированно находятся внутри него.
        shouldHide = true;
      } else {
        // Если запустили снаружи, проверяем, чтобы инстанс не лежал ни в каком мастер-компоненте
        let isInsideAnyMaster = false;
        let p: BaseNode | null = instance.parent;
        while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
          if (p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') {
            isInsideAnyMaster = true;
            break;
          }
          p = p.parent;
        }
        if (!isInsideAnyMaster) {
          shouldHide = true;
        }
      }

      if (shouldHide) {
        instance.visible = false;
        hiddenCount++;
      }
    }

    // Обновляем прогресс, если элементов много
    if (targetInstances.length > chunkSize) {
      notification.cancel();
      const progress = Math.min(i + chunkSize, targetInstances.length);
      const percent = Math.round((progress / targetInstances.length) * 100);
      notification = figma.notify(`Обработка инстансов: ${percent}% (${progress} из ${targetInstances.length})`, { timeout: 100000 });
      
      // Даем UI обновиться
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  notification.cancel();
  figma.notify(`Скрыто инстансов: ${hiddenCount}`);
  figma.closePlugin();
}

// 6. Логика для случайного выбора элементов
function selectRandom() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify('Пожалуйста, выделите объекты для случайного выбора.');
    figma.closePlugin();
    return;
  }

  if (selection.length === 1) {
    figma.notify('Выделен только один объект. Для случайного выбора нужно больше одного.');
    figma.closePlugin();
    return;
  }

  // Определяем минимальное количество объектов, которые нужно оставить
  let minKeep = 1;
  if (selection.length > 3) {
    // Если объектов больше 3, сбрасываем не более 50% (то есть оставляем минимум половину)
    minKeep = Math.ceil(selection.length / 2);
  }
  
  // Максимальное количество объектов (всегда меньше исходного выделения)
  const maxKeep = selection.length - 1;
  
  // Случайное количество от minKeep до maxKeep
  const countToKeep = Math.floor(Math.random() * (maxKeep - minKeep + 1)) + minKeep;
  
  // Перемешиваем массив
  const shuffled = [...selection].sort(() => 0.5 - Math.random());
  
  // Берем первые countToKeep элементов
  const newSelection = shuffled.slice(0, countToKeep);

  figma.currentPage.selection = newSelection;
  figma.notify(`Случайно оставлено объектов: ${countToKeep} из ${selection.length}`);
  figma.closePlugin();
}

// 7. Главная функция плагина
async function main() {
  // Проверяем, какая команда была вызвана из меню
  if (figma.command === 'select-random') {
    selectRandom();
    return;
  }

  if (figma.command === 'select-first-child' || figma.command === 'select-last-child') {
    selectChild(figma.command);
    return;
  }

  if (figma.command === 'hide-all-instances') {
    await hideAllInstances();
    return;
  }

  // По умолчанию (или если команда select-similar)
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