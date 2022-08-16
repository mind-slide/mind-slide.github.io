import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { fabric } from 'fabric';
import { CompactPicker } from 'react-color';
import {
  INPUT_ID,
  MIN_ATTACH_RANGE,
  MIN_DRAG_RANGE,
  Data,
  Offset,
  Size,
  MIN_DIS_SIB,
  DIS_PARENT_CHILDREN,
  OffsetChangedType,
} from './common';
import {
  arr_equals,
  dis2d,
  gen_id,
  get_global_offset,
  sleep,
  DataURLToSVG,
  img_stop_propagation_events,
} from './utils';
import styles from './index.less';

const default_color = '#4d4d4d';

const CANVAS_ID = 'canvas';

let canvas;

const CanvasEditor = (props) => {
  const [brush_color, setBrushColor] = useState(default_color);
  const [showPicker, setShowPicker] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);

  React.useEffect(() => {
    canvas = new fabric.Canvas(CANVAS_ID);
    canvas.isDrawingMode = false;

    canvas.freeDrawingBrush.width = 4;

    if (props.img) {
      let i = props.img;
      if (props.img.startsWith('data:image/svg+xml,')) {
        i = DataURLToSVG(props.img);
      }
      if (i.startsWith('<?xml')) {
        fabric.loadSVGFromString(i, function (objects, options) {
          objects.forEach((j) => {
            const svgData = fabric.util.groupSVGElements([j], options);
            canvas.add(svgData);
          });
        });
      } else {
        fabric.Image.fromURL(props.img, function (myImg) {
          const img = myImg.set({ left: 0, top: 0 });
          canvas.add(img);
        });
      }
    }
  }, []);

  React.useEffect(() => {
    canvas.isDrawingMode = drawingMode;
  }, [drawingMode]);


  return (
    <div
      className={styles.canvasEditor}
      {...img_stop_propagation_events}
      tabIndex={0}
      onKeyDown={(e) => {
        const keyToAction = {
          Backspace: () => {
            e.preventDefault();
            e.stopPropagation();
            canvas.remove(canvas.getActiveObject());
          },
        };
        if (keyToAction[e.key]) {
          keyToAction[e.key]();
        }
      }}
    >
      <div className={styles.flex}>
        <div
          className={styles.btn}
          onClick={() => {
            setDrawingMode(!drawingMode);
          }}
        >
          <span style={{ border: drawingMode ? 'none' : '1px solid white' }}>
            选择
          </span>
          /
          <span style={{ border: drawingMode ? '1px solid white' : 'none' }}>
            画笔
          </span>
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            canvas.add(
              new fabric.Circle({
                radius: 100,
                stroke: brush_color,
                strokeWidth: 4,
                fill: 'transparent',
                scaleY: 0.5,
                top: 100,
                left: 100,
                originX: 'center',
                originY: 'center',
              }),
            );
            setDrawingMode(false);
          }}
        >
          圆形
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            canvas.add(
              new fabric.Rect({
                top: 100,
                left: 100,
                width: 60,
                height: 70,
                fill: 'transparent',
                stroke: brush_color,
                strokeWidth: 4,
              }),
            );
            setDrawingMode(false);
          }}
        >
          矩形
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            const text = prompt('请输入');
            if (!text) {
              return;
            }
            canvas.add(
              new fabric.Text(text, {
                fontSize: 30,
                fill: brush_color,
                top: 100,
                left: 100,
                originX: 'center',
                originY: 'center',
              }),
            );
            setDrawingMode(false);
          }}
        >
          文本
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            const target = canvas.getActiveObject();
            if (!target) {
              alert('请先选择要删除的元素');
              return;
            }
            canvas.remove(target);
          }}
        >
          删除
        </div>
        <div
          className={styles.btnColor}
          onClick={() => setShowPicker(!showPicker)}
          style={{ background: brush_color }}
        >
          {showPicker ? (
            <CompactPicker
              color={brush_color}
              onChange={(e) => {
                const a = canvas.getActiveObject();
                if (a) {
                  a.setOptions(a.stroke ? { stroke: e.hex } : { fill: e.hex });
                  canvas.renderAll();
                }
                canvas.freeDrawingBrush.color = e.hex;
                setBrushColor(e.hex);
              }}
            />
          ) : null}
        </div>
        <div className={styles.flex1} />
        <div
          className={styles.btn}
          onClick={() => {
            if (!canvas.getObjects().length) {
              return;
            }
            canvas.discardActiveObject();
            const sel = new fabric.ActiveSelection(canvas.getObjects(), {
              canvas: canvas,
            });
            canvas.setActiveObject(sel);
            sel.set('left', 0);
            sel.set('top', 0);
            const { width, height } = sel.getBoundingRect();
            const oHeight = canvas.height;
            const oWidth = canvas.width;
            canvas.setHeight(height);
            canvas.setWidth(width);
            props.onCommit(canvas.toSVG(), {
              width,
              height,
            });
            canvas.setHeight(oHeight);
            canvas.setWidth(oWidth);
          }}
        >
          确定
        </div>
        <div
          className={styles.btn}
          onClick={() => {
            props.onClose();
          }}
        >
          关闭
        </div>
      </div>
      <canvas
        id={CANVAS_ID}
        width={window.innerWidth - 40 - props.slideWidth}
        height={window.innerHeight}
      />
    </div>
  );
};

export default CanvasEditor;
