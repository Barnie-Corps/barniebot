const utils = {
    createArrows: (length: number): string => {
        let arrows = "";
        for (let i = 0; i < length; i++) {
            arrows += "^"
        }
        return arrows;
    },
    createSpaces: (length: number): string => {
        let spaces = "";
        for (let i = 0; i < length; i++) {
            spaces += " ";
        }
        return spaces;
    }
};
export default utils;