import { DocumentColorEnum, highlightColors } from '../constants/colors';

export const multiHighlight = (
  textToHighlight: string,
  pageNumber: number,
  color = DocumentColorEnum.yellow
) => {
  // Clean up any existing highlights
  const existingHighlights = document.querySelectorAll('.highlight-wrapper');
  existingHighlights.forEach(el => el.remove());

  const textLayer = document.querySelector(
    `.react-pdf__Page[data-page-number="${pageNumber + 1}"] .react-pdf__Page__textContent`
  );
  
  if (!textLayer) return false;

  const spans = Array.from(textLayer.children) as HTMLElement[];
  
  // Clean and normalize text
  const normalizeText = (text: string) => 
    text.replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .toLowerCase()
        .trim();

  // Split search text into words and normalize each
  const searchWords = normalizeText(textToHighlight)
    .split(' ')
    .filter(word => word.length > 2); // Only look for words longer than 2 chars

  console.log('Search words:', searchWords);

  if (searchWords.length === 0) return false;

  // Find all spans containing any search words
  const matchingSpanIndices: number[] = [];
  
  spans.forEach((span, index) => {
    const spanText = normalizeText(span.textContent || '');
    console.log(`Span ${index}:`, spanText);
    
    // Check if this span contains any of our search words
    const matchedWords = searchWords.filter(word => spanText.includes(word));
    if (matchedWords.length > 0) {
      console.log(`Found words in span ${index}:`, matchedWords);
      matchingSpanIndices.push(index);
    }
  });

  console.log('Matching span indices:', matchingSpanIndices);

  // Group nearby spans together
  const spanGroups: number[][] = [];
  let currentGroup: number[] = [];
  
  matchingSpanIndices.forEach((index, i) => {
    if (i === 0 || index - matchingSpanIndices[i - 1] > 5) {
      if (currentGroup.length > 0) {
        spanGroups.push(currentGroup);
      }
      currentGroup = [index];
    } else {
      // Add any spans between the last match and this one
      for (let j = matchingSpanIndices[i - 1] + 1; j <= index; j++) {
        currentGroup.push(j);
      }
    }
  });
  
  if (currentGroup.length > 0) {
    spanGroups.push(currentGroup);
  }

  console.log('Span groups:', spanGroups);

  // Find the group with the most search words
  let bestGroup: number[] = [];
  let bestMatchCount = 0;

  spanGroups.forEach(group => {
    const groupText = group
      .map(index => normalizeText(spans[index].textContent || ''))
      .join(' ');
    
    const matchCount = searchWords.filter(word => groupText.includes(word)).length;
    if (matchCount > bestMatchCount) {
      bestMatchCount = matchCount;
      bestGroup = group;
    }
  });

  console.log('Best group:', bestGroup, 'with', bestMatchCount, 'matches');

  // Highlight the best group if it matches enough words
  if (bestMatchCount >= Math.min(2, searchWords.length)) {
    bestGroup.forEach(index => {
      const span = spans[index];
      const highlight = document.createElement('div');
      highlight.className = `highlight-wrapper ${highlightColors[color]}`;
      highlight.style.cssText = `
        position: absolute;
        left: ${span.offsetLeft}px;
        top: ${span.offsetTop}px;
        width: ${span.offsetWidth}px;
        height: ${span.offsetHeight}px;
        background-color: ${color === DocumentColorEnum.yellow ? 'rgba(253, 230, 138, 0.8)' : 'rgba(191, 219, 254, 0.8)'};
        pointer-events: none;
        z-index: 2;
      `;
      textLayer.appendChild(highlight);
    });
    return true;
  }

  return false;
}; 