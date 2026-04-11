export async function hideAllInstances(scope: 'page' | 'document') {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    figma.notify('Пожалуйста, выделите один элемент.');
    figma.closePlugin();
    return;
  }

  const targetNode = selection[0];
  
  // 1. Ищем родительский инстанс или компонент
  let closestParentRoot: ComponentNode | InstanceNode | ComponentSetNode | null = null;
  let curr = targetNode.parent;
  while (curr && curr.type !== 'PAGE' && curr.type !== 'DOCUMENT') {
    if (curr.type === 'COMPONENT' || curr.type === 'INSTANCE' || curr.type === 'COMPONENT_SET') {
      closestParentRoot = curr as ComponentNode | InstanceNode | ComponentSetNode;
      break;
    }
    try { curr = curr.parent; } catch (e) { curr = null; }
  }

  const isTargetRoot = !closestParentRoot;
  const rootNodeForSearch = closestParentRoot || targetNode;
  let searchRootComponent: ComponentNode | ComponentSetNode | null = null;

  // 2. Определяем корневой компонент (СТРОГО текущий вариант, без эскалации до ComponentSet)
  if (rootNodeForSearch.type === 'INSTANCE') {
    searchRootComponent = rootNodeForSearch.mainComponent;
  } else if (rootNodeForSearch.type === 'COMPONENT' || rootNodeForSearch.type === 'COMPONENT_SET') {
    searchRootComponent = rootNodeForSearch as ComponentNode | ComponentSetNode;
  }

  if (!searchRootComponent) {
    figma.notify('Выделенный элемент должен быть инстансом/компонентом или находиться внутри них.');
    figma.closePlugin();
    return;
  }

  let notification = figma.notify('Скрытие элементов...', { timeout: 100000 });
  await new Promise(resolve => setTimeout(resolve, 10));

  let hiddenCount = 0;
  let allInstances: InstanceNode[] = [];

  // 3. Быстрый поиск инстансов ТОЛЬКО текущего варианта
  if (scope === 'page') {
    const rootId = searchRootComponent.id;
    const isSet = searchRootComponent.type === 'COMPONENT_SET';
    
    allInstances = figma.currentPage.findAllWithCriteria({ types: ['INSTANCE'] }).filter(inst => {
      try {
        const mainComp = inst.mainComponent;
        if (!mainComp) return false;
        // Если искали по ComponentSet (выделили саму фиолетовую рамку), ищем все варианты
        // Иначе ищем строго совпадение по конкретному варианту
        if (isSet) {
          return mainComp.parent?.id === rootId;
        } else {
          return mainComp.id === rootId;
        }
      } catch (e) { return false; }
    }) as InstanceNode[];
  } else {
    try {
      if (searchRootComponent.type === 'COMPONENT_SET') {
        for (const variant of searchRootComponent.children) {
          if (variant.type === 'COMPONENT') {
            allInstances = allInstances.concat(await variant.getInstancesAsync());
          }
        }
      } else {
        allInstances = await searchRootComponent.getInstancesAsync();
      }
    } catch (e) {
      console.error('Ошибка при getInstancesAsync:', e);
    }
  }

  // 4. Скрытие элементов
  if (isTargetRoot) {
    // Скрываем инстансы целиком
    for (const inst of allInstances) {
      if (inst.visible) {
        try { inst.visible = false; hiddenCount++; } catch (e) {}
      }
    }
  } else {
    // Вычисляем внутренний ID один раз для всех инстансов этого варианта
    let internalId = targetNode.id;
    
    // Если мы выделили слой внутри инстанса, отрезаем ID этого инстанса
    if (closestParentRoot && closestParentRoot.type === 'INSTANCE') {
      const rootId = closestParentRoot.id;
      // В Figma ID инстанса может начинаться с 'I' (если это вложенный инстанс) или без нее
      const prefix = rootId.startsWith('I') ? `${rootId};` : `I${rootId};`;
      if (internalId.startsWith(prefix)) {
        internalId = internalId.substring(prefix.length);
      }
    }
    
    // Убираем 'I' в начале внутреннего пути (если мы выделили слой внутри вложенного инстанса в мастере)
    if (internalId.startsWith('I')) {
      internalId = internalId.substring(1);
    }

    for (const inst of allInstances) {
      try {
        // Конструируем ID для каждого инстанса
        const instPrefix = inst.id.startsWith('I') ? inst.id : `I${inst.id}`;
        const constructedId = `${instPrefix};${internalId}`;
        const nodeToHide = figma.getNodeById(constructedId) as SceneNode | null;
        
        if (nodeToHide && nodeToHide.visible) {
          nodeToHide.visible = false;
          hiddenCount++;
        }
      } catch (e) {}
    }
  }

  notification.cancel();
  figma.notify(`Скрыто элементов: ${hiddenCount}`);
  figma.closePlugin();
}