export enum DocumentColorEnum {
  yellow = "bg-yellow-100/40",
  blue = "bg-blue-100/40",
  green = "bg-green-100/40",
  red = "bg-red-100/40",
}

export const highlightColors: { [key in DocumentColorEnum]: string } = {
  [DocumentColorEnum.yellow]: "bg-yellow-100",
  [DocumentColorEnum.blue]: "bg-blue-100",
  [DocumentColorEnum.green]: "bg-green-100",
  [DocumentColorEnum.red]: "bg-red-100",
};
