import { findSimilarNodes } from './selectSimilar';
import { hideAllInstances } from './hideInstances';
import { selectChild } from './selectChild';
import { selectRandom } from './selectRandom';

// Главная функция плагина
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
    await hideAllInstances('page');
    return;
  }

  if (figma.command === 'hide-all-instances-document') {
    await hideAllInstances('document');
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
