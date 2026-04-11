export function selectRandom() {
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
