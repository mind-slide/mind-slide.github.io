import React, { useEffect, useMemo, memo, useState } from 'react';
import ReactDOM from 'react-dom';

import styles from './index.less';
import {
  defaultData,
  img_stop_propagation_events,
  arr_equals,
  compute_text_size,
  compute_node_size,
} from './utils';
import {
  NODE_TEXT_PADDING,
  LINE_WIDTH,
  Data,
  Offset,
  Size,
  MIN_DIS_SIB,
  DIS_PARENT_CHILDREN,
  OffsetChangedType,
  Img,
} from './common';
import { Map, List } from 'immutable';

/**
 * offset: 该节点相对于父节点的位移
 **/
export const NodePath = (props: { offset: Offset }) => {
  const offset = props.offset;

  const x1 = 0;
  const y1 = offset.y < 0 ? -offset.y + LINE_WIDTH / 2 : LINE_WIDTH / 2;
  const x2 = offset.x;
  const y2 = offset.y < 0 ? 0 + LINE_WIDTH / 2 : offset.y + LINE_WIDTH / 2;
  const cx1 = x1 + 20;
  const cy1 = y1;
  const cx2 = x2 - 20;
  const cy2 = y2;
  return (
    <svg
      style={offset.y < 0 ? { top: `calc(100%)` } : { bottom: -LINE_WIDTH }}
      width={Math.abs(offset.x)}
      height={Math.abs(offset.y) + LINE_WIDTH}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={`M${x1} ${y1} C ${cx1} ${cy1} ${cx2} ${cy2} ${x2} ${y2}`}
        stroke="gray"
        strokeWidth="2"
        fill="transparent"
      />
    </svg>
  );
};

const MindNode = memo(
  ({
    path,
    offsetX,
    offsetY,
    is_root,
    scale,
    events,
    sizes,

    name,
    imgs,
    children,
    important,

    img_remove_on_click,
    img_move_left_on_click,
    img_move_right_on_click,
    img_edit_on_click,
    img_independent_on_click,
  }: {
    img_remove_on_click: Function;
    img_move_left_on_click: Function;
    img_move_right_on_click: Function;
    img_edit_on_click: Function;
    img_independent_on_click: Function;

    path: string;
    offsetX: number;
    offsetY: number;
    is_root?: boolean;
    scale: number;
    events: { [name: string]: Function };

    name: string;
    imgs: List<any>;
    children: List<Data>;
    sizes: Map<string, any>;
    important: boolean;
  }) => {
    const path_arr = path.split('-');
    const [selected_img, setSelectedImg] = useState({
      show: false,
      index: 0,
    });

    const node_text_size = {
      width: sizes.get('text_size').get('width'),
      height: sizes.get('text_size').get('height'),
    };

    const child_offsets = sizes.get('child_offsets');

    return (
      <div
        className={styles.node}
        style={{
          left: offsetX,
          top: offsetY,
          height: node_text_size.height,
          borderColor: important ? '#ff6666' : '#2196f3',
        }}
        id={path}
        data-node
        {...Object.keys(events).reduce((m, i) => {
          m[i] = (e) => {
            events[i](path_arr, e);
          };
          return m;
        }, {})}
        onTouchStart={(e) => {
          const touchmove_listener = (_e) => events.onTouchMove(path_arr, _e);
          const target = e.target;
          const touchend_listener = (_e) => {
            target.removeEventListener('touchend', touchend_listener);
            target.removeEventListener('touchmove', touchmove_listener);
            events.onTouchEnd(path_arr, _e);
          };
          target.addEventListener('touchend', touchend_listener);
          target.addEventListener('touchmove', touchmove_listener);
          events.onTouchStart(path_arr, e);
        }}
      >
        <div
          className={styles.nodeText}
          style={{
            width: node_text_size.width - NODE_TEXT_PADDING * 2 + 1,
            height: node_text_size.height,
          }}
        >
          {name}
        </div>
        {imgs.size ? (
          <div className={styles.imgStack}>
            {imgs.map((i, index) => (
              <div
                className={styles.imgWrap}
                key={i.get('id')}
                style={
                  index === 0
                    ? {}
                    : {
                        marginLeft: `-${Math.floor(
                          100 * (1 / (imgs.size + 1)),
                        )}%`,
                      }
                }
              >
                <img
                  src={i.get('src')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImg({
                      index,
                      show: true,
                    });
                  }}
                  {...img_stop_propagation_events}
                />
                {selected_img.show && selected_img.index === index ? (
                  <React.Fragment>
                    <div
                      className={styles.imgBtn}
                      style={{
                        right: 0,
                        bottom: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const index = selected_img.index;
                        img_move_right_on_click(index);
                        setSelectedImg({
                          ...selected_img,
                          index: Math.min(index + 1, imgs.size - 1),
                        });
                      }}
                      {...img_stop_propagation_events}
                    >
                      →
                    </div>
                    <div
                      className={styles.imgBtn}
                      style={{
                        left: 0,
                        bottom: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const index = selected_img.index;
                        img_move_left_on_click(index);
                        setSelectedImg({
                          ...selected_img,
                          index: Math.max(0, index - 1),
                        });
                      }}
                      {...img_stop_propagation_events}
                    >
                      ←
                    </div>
                    <div
                      className={styles.imgBtn}
                      style={{
                        top: 0,
                        right: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const index = selected_img.index;
                        img_remove_on_click(index);
                        setSelectedImg({ ...selected_img, show: false });
                      }}
                      {...img_stop_propagation_events}
                    >
                      ✕
                    </div>
                    <div
                      style={{
                        bottom: -20,
                        justifyContent: 'center',
                        width: '100%',
                        whiteSpace: 'nowrap',
                      }}
                      {...img_stop_propagation_events}
                      className={styles.imgBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        img_independent_on_click(
                          selected_img.index,
                          !i.get('independent'),
                        );
                      }}
                    >
                      <div>
                        <input
                          type="checkbox"
                          checked={i.get('independent')}
                          readOnly
                          {...img_stop_propagation_events}
                        />
                      </div>
                      <span>独立</span>
                    </div>
                    <div
                      style={{
                        top: 0,
                        left: 0,
                      }}
                      {...img_stop_propagation_events}
                      className={styles.imgBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        img_edit_on_click(selected_img.index);
                      }}
                    >
                      ✎
                    </div>
                  </React.Fragment>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {is_root ? null : (
          <NodePath
            offset={{
              x: offsetX,
              y: offsetY + (offsetY !== 0 ? node_text_size.height : 0),
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: node_text_size.width,
          }}
        >
          {children.map((i, index) => (
            <MindNode
              scale={scale}
              path={
                is_root
                  ? ['children', index.toString()].join('-')
                  : [path, 'children', index.toString()].join('-')
              }
              key={i.get('id')}
              sizes={sizes.getIn(['children', index])}
              offsetX={child_offsets.getIn([index, 'x'])}
              offsetY={child_offsets.getIn([index, 'y'])}
              events={events}
              important={i.get('important')}
              name={i.get('name')}
              children={i.get('children')}
              imgs={i.get('imgs')}
              img_edit_on_click={img_edit_on_click}
              img_move_left_on_click={img_move_left_on_click}
              img_move_right_on_click={img_move_right_on_click}
              img_independent_on_click={img_independent_on_click}
              img_remove_on_click={img_remove_on_click}
            />
          ))}
        </div>
      </div>
    );
  },
);
export default MindNode;