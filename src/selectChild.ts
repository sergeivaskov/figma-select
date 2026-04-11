export function selectChild(command: 'select-first-child' | 'select-last-child') {
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
