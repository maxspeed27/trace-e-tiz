export enum DocumentColorEnum {
  yellow = 'bg-yellow-200/50',
  blue = 'bg-blue-200/50',
  green = 'bg-green-200/50',
  red = 'bg-red-200/50'
}

export const highlightColors: { [key in DocumentColorEnum]: string } = {
  [DocumentColorEnum.yellow]: 'bg-yellow-100',
  [DocumentColorEnum.blue]: 'bg-blue-100',
  [DocumentColorEnum.green]: 'bg-green-100',
  [DocumentColorEnum.red]: 'bg-red-100'
}; 