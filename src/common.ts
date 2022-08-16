import { fromJS, Map, List } from 'immutable';

export const MIN_DIS_SIB = 50;
export const DIS_PARENT_CHILDREN = 40;
export const LINE_WIDTH = 4;
export const NODE_TEXT_PADDING = 5;
export const INPUT_ID = 'input_id';
export const MAX_TEXT_WIDTH = 600;

export const MIN_DRAG_RANGE = 25;
export const MIN_ATTACH_RANGE = 1360;

export enum OffsetChangedType {
  change,
  remove,
  mount,
}

export type Img = {
  src: string;
  id: string;
  size: {
    width: number;
    height: number;
  };
  offset: {
    x: number;
    y: number;
  };
  independent: boolean;
};

export type DataRAW = {
  id: string;
  name: string;
  children?: DataRAW[];
  imgs?: Img[];
};

export type Data = Map<string, any>;

export type Offset = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};
