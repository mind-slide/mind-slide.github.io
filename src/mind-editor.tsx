import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';

import { Map, fromJS } from 'immutable';
import styles, { selected } from './index.less';
import {
  img_stop_propagation_events,
  arr_equals,
  dis2d,
  gen_id,
  get_global_offset,
  sleep,
  compute_node_size,
} from './utils';
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
import { svgToDataURL, compute_text_size, upload, retrieve } from './utils';
import MindNode from './node';

let mouseDownType = '';
const CanvasEditor = React.lazy(
  () => import(/* webpackChunkName: "canvas-editor" */ './canvas-editor'),
);
const latestMouseDown: Offset = { x: 0, y: 0 };
const latestMouseMove: Offset = { x: 0, y: 0 };

const workspaceLatestMouseDown: Offset = { x: 0, y: 0 };
const workspaceLatestMouseMove: Offset = { x: 0, y: 0 };
let workspace_dragging = false;
let workspace_is_dragging = false;

let is_dragging = false;
let dragging_ready = false;

const mouse_middleware = (e, f, extra?) => {
  const offset = {
    x:
      e.touches && e.touches[0]
        ? e.touches[0].pageX
        : e.changedTouches && e.changedTouches[0]
        ? e.changedTouches[0].pageX
        : e.pageX,
    y:
      e.touches && e.touches[0]
        ? e.touches[0].pageY
        : e.changedTouches && e.changedTouches[0]
        ? e.changedTouches[0].pageY
        : e.pageY,
  };
  f(offset, extra);
};

enum ClueType {
  insert,
  appendChild,
}

const latest: {
  data: any;
  dragging_data: any;
  path?: string[];
  path_preserved?: string[];
  clue: any;
  input_value: string;
  offset: Offset;
  node_candidates?: { offset: Offset; id: string; path: string[] }[];
  mousedown_offset?: Offset;
} = {
  offset: { x: 0, y: 0 },
  data: undefined,
  dragging_data: undefined,
  clue: undefined,
  input_value: '',
  path: undefined,
  path_preserved: undefined,
};
export const MindEditor = ({
  slideWidth,
  setOffset,
  offset,
  scale,
  setScale,
  data,
  setData,
  projectId,
}: {
  slideWidth: number;
  scale: number;
  offset: Offset;
  setOffset: Function;
  setScale: Function;
  data: any;
  setData: Function;
  projectId: string;
}) => {
  const [canvasEditor, setCanvasEditor] = useState<{
    show: boolean;
    img: string;
    cb?: Function;
  }>({
    show: false,
    img: '',
    cb: undefined,
  });
  const [selectedUI, setSelectedUI] = useState<{
    show: boolean;
    text: string;
    offset: Offset;
    size: Size;
    important?: boolean;
    merge?: boolean;
    ignore?: boolean;
  }>({
    show: false,
    text: '',
    offset: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  });

  const [dragging_data, setDraggingData] = useState(undefined);
  const [dragging_offset, setDraggingOffset] = useState({ x: 0, y: 0 });
  const [showInserMenu, setShowInsertMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>();
  const [selectedPath, setSelectedPath] = useState<string[]>(undefined);
  const sizesRef = useRef(
    Map<string, any>(
      fromJS({
        size: { width: 0, height: 0 },
        text_size: { width: 0, hieght: 0 },
        child_offsets: [],
        children: [],
      }),
    ),
  );
  const latestProjectIdRef = useRef('');
  const [clue, setClue] = useState<{
    path: string[];
    show: boolean;
    offset: Offset;
    type?: ClueType;
  }>({
    show: false,
    path: [],
    offset: { x: 0, y: 0 },
  });

  latest.clue = clue;
  latest.dragging_data = dragging_data;
  latest.data = data;
  latest.offset = offset;

  const unselect = useCallback(() => {
    setShowInsertMenu(false);
    const id = latest.data.getIn([...(latest.path || []), 'id']);
    const item = document.getElementById(id);
    item && item.removeAttribute('data-active');
    inputRef.current && inputRef.current.blur();
    latest.path = undefined;
    setSelectedPath(undefined);
    setSelectedUI((s) => ({ ...s, show: false }));
  }, []);

  const update_sizes = useCallback((data, scale, projectId) => {
    const new_sizes = compute_node_size({ data, scale });
    if (projectId !== latestProjectIdRef.current) {
      unselect();
      latestProjectIdRef.current = projectId;
      sizesRef.current = new_sizes;
      return sizesRef.current;
    }
    // a,b 层级结构需要一致，不处理增加删除
    function deep_merge(a, b) {
      if (a.equals(b)) {
        return a;
      }
      if (!a.get('text_size').equals(b.get('text_size'))) {
        a = a.set('text_size', b.get('text_size'));
      }
      if (!a.get('size').equals(b.get('size'))) {
        a = a.set('size', b.get('size'));
      }
      if (!a.get('child_offsets').equals(b.get('child_offsets'))) {
        a = a.set('child_offsets', b.get('child_offsets'));
      }
      if (!a.get('children').equals(b.get('children'))) {
        a = a.set(
          'children',
          a
            .get('children')
            .map((i, idx) => deep_merge(i, b.getIn(['children', idx]))),
        );
      }
      return a;
    }
    sizesRef.current = deep_merge(sizesRef.current, new_sizes);
    return sizesRef.current;
  }, []);
  const sizes = useMemo(() => {
    return update_sizes(data, scale, projectId);
  }, [data, scale, projectId]);
  const [sharingDialog, setSharingDialog] = useState<{
    show: boolean;
    hash: string;
    current: number;
    total: number | string;
  }>({
    show: false,
    hash: '',
    current: 0,
    total: 0,
  });

  useEffect(() => {
    if (!selectedPath) return;
    const path = selectedPath;
    const d = latest.data;
    latest.path = path;
    const is_root = path.length == 1 && !path[0];
    latest.input_value = d.getIn(is_root ? ['name'] : [...path, 'name']);
    inputRef!.current!.value = latest.input_value;
    inputRef!.current!.focus();

    const item = document.querySelector('[data-active]');
    item && item.removeAttribute('data-active');

    const node_ele = document.getElementById(path.join('-'));
    node_ele && node_ele.setAttribute('data-active', '');

    const node_text_size = compute_text_size(latest.input_value);
    inputRef.current.style.width = node_text_size.width + 'px';
    inputRef.current.style.height = node_text_size.height + 'px';
    const sizes = compute_node_size({ data: d, scale });
    const global_offset = {
      x: offset.x,
      y: offset.y,
    };
    if (path.length !== 1) {
      for (let i = 0, p = []; i < path.length; ++i) {
        if (path[i] === 'children') {
          p.push(path[i]);
          continue;
        }
        const t = sizes.getIn(p.slice(0, -1));
        const offsets = t.get('child_offsets');
        global_offset.x +=
          offsets.getIn([path[i], 'x']) + t.getIn(['text_size', 'width']);
        global_offset.y +=
          offsets.getIn([path[i], 'y']) + t.getIn(['text_size', 'height']);
        p.push(path[i]);
      }
    }
    setSelectedUI({
      show: true,
      text: d.getIn(is_root ? ['name'] : [...path, 'name']),
      offset: global_offset,
      size: compute_text_size(d.getIn(is_root ? ['name'] : [...path, 'name'])),
      ignore: !!d.getIn(is_root ? ['ignore'] : [...path, 'ignore']),
      important: !!d.getIn(is_root ? ['important'] : [...path, 'important']),
      merge: !!d.getIn(is_root ? ['merge'] : [...path, 'merge']),
    });
  }, [offset, scale, selectedPath]);

  const appendChild = useCallback(
    (
      d = {
        id: gen_id(),
        name: '',
        imgs: [],
        children: [],
      },
    ) => {
      unselect();
      const new_path = latest.path_preserved.length == 1 && !latest.path_preserved[0] ? ['children'] : [...latest.path_preserved, 'children'];
      const new_data = latest.data.updateIn(new_path, (list) =>
        list.push(fromJS(d)),
      );
      sizesRef.current = sizesRef.current.updateIn(new_path, (list) =>
        list.push(
          fromJS({
            size: { x: 0, y: 0 },
            text_size: { x: 0, y: 0 },
            child_offsets: [],
            children: [],
          }),
        ),
      );
      setData(new_data);
      latest.path = [
        ...new_path,
        (new_data.getIn(new_path).size - 1).toString(),
      ];
      latest.path_preserved = latest.path;
      setSelectedPath(latest.path);
    },
    [],
  );

  const insert = useCallback((p = latest.path_preserved) => {
    unselect();
    const new_path = p.slice(0, p.length - 1);
    const index = parseInt(p[p.length - 1]) + 1;
    const new_data = latest.data.updateIn(new_path, (list) =>
      list.insert(
        index,
        fromJS({
          id: gen_id(),
          name: '',
          imgs: [],
          children: [],
        }),
      ),
    );
    sizesRef.current = sizesRef.current.updateIn(new_path, (list) =>
      list.insert(
        index,
        fromJS({
          size: { x: 0, y: 0 },
          text_size: { x: 0, y: 0 },
          child_offsets: [],
          children: [],
        }),
      ),
    );
    latest.data = new_data;
    latest.path = [...new_path, index.toString()];
    latest.path_preserved = latest.path;
    setData(new_data);
    setSelectedPath([...latest.path]);
  }, []);

  const workspace_on_mouse_down = useCallback(
    (workspace_offset) => {
      console.log('w d');
      const item = document.getElementById(latest.path_preserved.join('-'));
      item && item.removeAttribute('data-active');
      mouseDownType = 'workspace';
      workspaceLatestMouseDown.x = workspace_offset.x;
      workspaceLatestMouseDown.y = workspace_offset.y;
      latest.mousedown_offset = offset;
    },
    [offset],
  );

  const workspace_on_mouse_move = useCallback(
    (offset) => {
      if (mouseDownType === 'workspace') {
        console.log('w m');
        workspaceLatestMouseMove.x = offset.x;
        workspaceLatestMouseMove.y = offset.y;
        if (
          !workspace_is_dragging &&
          dis2d(workspaceLatestMouseMove, workspaceLatestMouseDown) >
            MIN_DRAG_RANGE
        ) {
          workspace_is_dragging = true;
        }
        if (workspace_is_dragging) {
          setOffset({
            x:
              latest.mousedown_offset.x +
              workspaceLatestMouseMove.x -
              workspaceLatestMouseDown.x,
            y:
              latest.mousedown_offset.y +
              workspaceLatestMouseMove.y -
              workspaceLatestMouseDown.y,
          });
        }
      } else if (mouseDownType === 'node') {
        console.log('n m');
        latestMouseMove.x = offset.x;
        latestMouseMove.y = offset.y;
        if (
          !is_dragging &&
          dis2d(latestMouseMove, latestMouseDown) > MIN_DRAG_RANGE
        ) {
          is_dragging = true;
          const ele = document.getElementById(latest.path.join('-'));
          ele.style.opacity = '0.3';
          setDraggingData(latest.data.getIn(latest.path));
        }
        if (is_dragging) {
          setDraggingOffset({
            x: -latest.offset.x + latestMouseMove.x,
            y: -latest.offset.y + latestMouseMove.y,
          });
          if (latest.node_candidates == undefined) {
            latest.node_candidates = Array.from(
              document.querySelectorAll('[data-node]'),
            )
              .filter((i) => {
                const id = i.getAttribute('id');
                const p = id.split('-');
                let t = 0;
                while (
                  latest.path_preserved[t] &&
                  p[t] == latest.path_preserved[t]
                ) {
                  ++t;
                }
                if (t >= latest.path_preserved.length) {
                  return false;
                }
                return !!id;
              })
              .map((i) => {
                const id = i.getAttribute('id');
                const path = id.split('-');
                const offset = get_global_offset(i as HTMLElement);
                const size = compute_text_size(
                  latest.data.getIn(path).get('name'),
                );
                return {
                  offset: {
                    x: offset.x + size.width,
                    y: offset.y + size.height,
                  },
                  path,
                  id,
                };
              });
          }
          const candidate = latest.node_candidates.filter(
            (i) => dis2d(i.offset, latestMouseMove) < MIN_ATTACH_RANGE,
          )[0];
          if (candidate) {
            setClue({
              offset: {
                x: candidate.offset.x - latest.offset.x,
                y: candidate.offset.y - latest.offset.y,
              },
              path: candidate.path,
              show: true,
              type:
                candidate.id.length > 0 &&
                candidate.offset.x > latestMouseMove.x
                  ? ClueType.insert
                  : ClueType.appendChild,
            });
          } else {
            setClue((s) => ({ ...s, show: false }));
          }
        }
      }
    },
    [offset],
  );

  const node_on_mouse_down = useCallback((offset, path) => {
    console.log('n d');
    mouseDownType = 'node';
    latest.path = path;
    latest.path_preserved = path;
    latest.input_value = latest.data.getIn([...path, 'name']);
    latestMouseDown.x = offset.x;
    latestMouseDown.y = offset.y;
    if (path.length) {
      dragging_ready = true;
    }
  }, []);

  const workspace_on_mouse_up = useCallback(() => {
    if (mouseDownType === 'node' && !is_dragging) {
      console.log('n c');
      setSelectedPath(latest.path);
      mouseDownType = '';
      return;
    }
    if (!mouseDownType) {
      return;
    }

    mouseDownType = '';
    if (latest.path) {
      unselect();
    }
    latest.node_candidates = undefined;
    dragging_ready = false;
    workspace_is_dragging = false;
    const clue = latest.clue;
    if (is_dragging) {
      // reset
      const ele = document.getElementById(latest.path_preserved.join('-'));
      ele.style.opacity = '1';

      if (clue.show) {
        setClue((c) => ({ ...c, show: false }));
        const real_clue_path = clue.path;
        let i = 0;
        while (real_clue_path[i] == latest.path_preserved[i]) {
          ++i;
        }
        if (i == latest.path_preserved.length - 1) {
          const a = parseInt(real_clue_path[i]);
          const b = parseInt(latest.path_preserved[i]);
          if (a > b) {
            real_clue_path[i] = (a - 1).toString();
          }
        }
        const new_path: string[] =
          clue.type === ClueType.appendChild
            ? [...real_clue_path, 'children']
            : real_clue_path.slice(0, real_clue_path.length - 1);
        const dragging_data = latest.dragging_data;
        let new_data = latest.data.deleteIn(latest.path_preserved);

        new_data =
          clue.type === ClueType.appendChild
            ? new_data.updateIn(new_path, (list) => list.push(dragging_data))
            : new_data.updateIn(new_path, (list) =>
                list.insert(
                  parseInt(clue.path[clue.path.length - 1]) + 1,
                  dragging_data,
                ),
              );

        // TODO 性能优化，局部计算
        sizesRef.current = compute_node_size({ data: new_data, scale });
        setData(new_data);
      }
      setDraggingData(undefined);
      is_dragging = false;
      console.log('n u');
    } else {
      console.log('w u');
    }
  }, [scale]);

  const addImage = useCallback((blob) => {
    if (blob) {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = (event) => {
        const base64 = event.target.result;
        const img = new Image();
        img.src = base64 as string;
        img.onload = () =>
          setData(
            latest.data.updateIn([...latest.path, 'imgs'], (list) =>
              list.push(
                fromJS({
                  id: gen_id(),
                  src: base64,
                  size: {
                    width: img.width,
                    height: img.height,
                  },
                }),
              ),
            ),
          );
      };
    }
  }, []);

  const node_events = useMemo(
    () => ({
      onMouseDown: (path, e) => {
        e.stopPropagation();
        mouse_middleware(e, node_on_mouse_down, path);
      },
      onTouchStart: (path, e) => {
        e.stopPropagation();
        mouse_middleware(e, node_on_mouse_down, path);
      },
      onTouchMove: (path, e) => {
        e.stopPropagation();
        mouse_middleware(e, workspace_on_mouse_move, path);
      },
      onMouseUp: (path, e) => {
        e.stopPropagation();
        mouse_middleware(e, workspace_on_mouse_up, path);
      },
      onTouchEnd: (path, e) => {
        e.stopPropagation();
        mouse_middleware(e, workspace_on_mouse_up, path);
      },
    }),
    [],
  );

  const onPaste = useCallback((e) => {
    const items = e.clipboardData.items;
    const item = items[items.length - 1];
    if (item.kind === 'file' && item.type.startsWith('image')) {
      const blob = item.getAsFile();
      addImage(blob);
    }
    return true;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!latest.path) {
        unselect();
      }
      e.stopPropagation();
      e.preventDefault();
      const r = 0.3;
      setOffset({
        x: offset.x - e.deltaX * r,
        y: offset.y - e.deltaY * r,
      });
    },
    [offset],
  );

  const input_on_keydown = useCallback((e) => {
    const keyToAction = {
      Enter: () => {
        e.preventDefault();
        e.stopPropagation();
        if (latest.path_preserved.length) {
          insert(latest.path_preserved);
        } else {
          unselect();
        }
      },
      Tab: () => {
        e.preventDefault();
        appendChild();
      },
      ArrowLeft: () => {
        // selectByPath(latest.path.slice(0, latest.path.length - 2));
      },
      ArrowRight: () => {
        // const children = data.getIn([...latest.path, 'children']);
        // if (children.size) {
        //   selectByPath([...latest.path, 'children', 0]);
        // }
      },
      ArrowUp: () => {
        if (latest.path.length) {
          setSelectedPath([
            ...latest.path.slice(0, latest.path.length - 1),
            Math.max(
              0,
              parseInt(latest.path[latest.path.length - 1]) - 1,
            ).toString(),
          ]);
        }
      },
      ArrowDown: () => {
        if (latest.path.length) {
          const children = latest.data.getIn(
            latest.path.slice(0, latest.path.length - 1),
          );
          setSelectedPath([
            ...latest.path.slice(0, latest.path.length - 1),
            Math.min(
              children.size - 1,
              parseInt(latest.path[latest.path.length - 1]) + 1,
            ).toString(),
          ]);
        }
      },
    };
    if (keyToAction[e.key]) {
      keyToAction[e.key]();
    }
  }, []);

  const input_on_input = useCallback((e) => {
    e.preventDefault();
    const size = compute_text_size(e.currentTarget.value);
    e.currentTarget.style.width = `${size.width}px`;
    e.currentTarget.style.height = `${size.height}px`;
    setData(
      latest.data.setIn(
        latest.path_preserved.length === 1 && !latest.path_preserved[0]
          ? ['name']
          : [...latest.path_preserved, 'name'],
        e.currentTarget.value,
      ),
    );
  }, []);

  const input_on_blur = useCallback((e) => {}, []);

  const img_remove_on_click = useCallback((index: number) => {
    setData(
      latest.data.updateIn([...latest.path, 'imgs'], (list) => list.deleteIn([index])),
    );
  }, []);

  const img_move_left_on_click = useCallback((index: number) => {
    setData(
      latest.data.updateIn([...latest.path, 'imgs'], (list) => {
        const item = list.get(index);
        return list.deleteIn([index]).insert(Math.max(0, index - 1), item);
      }),
    );
  }, []);

  const img_move_right_on_click = useCallback((index: number) => {
    setData(
      latest.data.updateIn([...latest.path, 'imgs'], (list) => {
        const item = list.get(index);
        return list.deleteIn([index]).insert(index + 1, item);
      }),
    );
  }, []);

  const img_independent_on_click = useCallback(
    (index: number, checked: boolean) => {
      setData(
        latest.data.setIn([...latest.path, 'imgs', index, 'independent'], checked),
      );
    },
    [],
  );

  const img_edit_on_click = useCallback((index: number, checked: boolean) => {
    const img = latest.data.getIn([
      ...latest.path,
      'imgs',
      index,
      'src',
    ]);
    setCanvasEditor({
      show: true,
      img,
      cb: (svg, size) => {
        const p = latest.data
          .getIn([...latest.path_preserved, 'imgs', index])
          .toJS();
        setData(
          latest.data.setIn(
            [...latest.path_preserved, 'imgs', index],
            fromJS({
              ...p,
              src: svgToDataURL(svg),
              size,
            }),
          ),
        );
        setCanvasEditor((s) => ({ ...s, show: false }));
      },
    });
  }, []);

  return (
    <div
      className={styles.workspace}
      id="workspace"
      onPaste={onPaste}
      onWheel={onWheel}
      onMouseUp={(e) => mouse_middleware(e, workspace_on_mouse_up)}
      onMouseMove={(e: React.MouseEvent<HTMLDivElement>) =>
        mouse_middleware(e, workspace_on_mouse_move)
      }
      onMouseDown={(e) => mouse_middleware(e, workspace_on_mouse_down)}
      onTouchMove={(e) => mouse_middleware(e, workspace_on_mouse_move)}
      onTouchStart={(e) => mouse_middleware(e, workspace_on_mouse_down)}
      onTouchEnd={(e) => mouse_middleware(e, workspace_on_mouse_up)}
      style={{
        right: slideWidth,
        width: `calc(100% - ${slideWidth}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: Math.floor(offset.x),
          top: Math.floor(offset.y),
        }}
      >
        {clue.show ? (
          <span
            className={
              clue.type === ClueType.appendChild
                ? styles.appendChild
                : styles.insert
            }
            style={{
              left: clue.offset.x,
              top: clue.offset.y,
            }}
          />
        ) : null}
        <MindNode
          scale={scale}
          sizes={sizes}
          important={data.get('important')}
          name={data.get('name')}
          children={data.get('children')}
          imgs={data.get('imgs')}
          path={''}
          offsetX={0}
          offsetY={0}
          is_root
          events={node_events}
          img_edit_on_click={img_edit_on_click}
          img_move_left_on_click={img_move_left_on_click}
          img_move_right_on_click={img_move_right_on_click}
          img_independent_on_click={img_independent_on_click}
          img_remove_on_click={img_remove_on_click}
        />
        {dragging_data ? (
          <MindNode
            scale={scale}
            sizes={sizesRef.current.getIn(latest.path)}
            path={''}
            offsetX={dragging_offset.x}
            offsetY={dragging_offset.y}
            important={dragging_data.get('important')}
            name={dragging_data.get('name')}
            children={dragging_data.get('children')}
            imgs={dragging_data.get('imgs')}
            is_root
            events={{}}
            img_edit_on_click={img_edit_on_click}
            img_move_left_on_click={img_move_left_on_click}
            img_move_right_on_click={img_move_right_on_click}
            img_independent_on_click={img_independent_on_click}
            img_remove_on_click={img_remove_on_click}
          />
        ) : null}
        <div
          className={styles.selected}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          style={
            selectedUI.show
              ? {
                  left: selectedUI.offset.x - offset.x,
                  top: selectedUI.offset.y - offset.y,
                  width: selectedUI.size.width,
                  height: selectedUI.size.height,
                }
              : { top: -99999 }
          }
        >
          <div className={styles.buttons}>
            {selectedUI.show ? (
              <div className={styles.checkboxList}>
                <div className={styles.checkboxListItem}>
                  <input
                    type="checkbox"
                    checked={selectedUI.important}
                    readOnly
                    onClick={(e) => {
                      e.stopPropagation();
                      setData(
                        latest.data.setIn(
                          [...latest.path, 'important'],
                          !selectedUI.important,
                        ),
                      );
                      setSelectedUI((s) => ({
                        ...s,
                        important: !selectedUI.important,
                      }));
                    }}
                  />
                  标记重点
                </div>
                <div className={styles.checkboxListItem}>
                  <input
                    type="checkbox"
                    checked={selectedUI.merge}
                    onClick={(e) => {
                      e.stopPropagation();
                      setData(
                        latest.data.setIn(
                          [...latest.path, 'merge'],
                          !selectedUI.merge,
                        ),
                      );
                      setSelectedUI((s) => ({
                        ...s,
                        merge: !selectedUI.merge,
                      }));
                    }}
                  />
                  合并显示
                </div>
              </div>
            ) : null}
            <div
              className={styles.share}
              style={{display: 'none'}}
              onClick={async (e) => {
                setSharingDialog({
                  show: true,
                  current: 0,
                  total: '?',
                  hash: '?',
                });
                upload(data.getIn(latest.path), (current, total, hash) => {
                  setSharingDialog({
                    show: true,
                    current,
                    total,
                    hash,
                  });
                });
              }}
            >
              共享节点
            </div>
            <div
              className={styles.btnInsertAny}
              onClick={() => {
                setShowInsertMenu(!showInserMenu);
              }}
            >
              <div>插入</div>
              {!showInserMenu ? null : (
                <div className={styles.insertType}>
                  <div
                    id="btn_insert_node"
                    className={styles.btnInsert}
                    onClick={() => {
                      insert();
                    }}
                  >
                    下方插入
                  </div>
                  <div
                    id="btn_append_node"
                    className={styles.btnAppendChild}
                    onClick={() => {
                      appendChild();
                    }}
                  >
                    右方插入
                  </div>
                  <div
                    id="btn_retrieve_node"
                    className={styles.btnRetrieveNode}
                    onClick={async () => {
                      const addr = prompt('输入共享节点地址');
                      if (!addr) {
                        return;
                      }
                      setLoading(true);
                      const d = await retrieve(addr);
                      if (d) {
                        appendChild(d);
                      } else {
                        alert('地址错误');
                      }
                      setLoading(false);
                    }}
                  >
                    插入共享节点
                  </div>
                  <div
                    id="btn_add_image"
                    className={styles.btnAddImg}
                    onClick={(e) => e.stopPropagation()}
                  >
                    添加图片
                    <input
                      type="file"
                      name=""
                      accept="image/*"
                      className={styles.addImgInput}
                      onInput={(e) => {
                        addImage((e as any).target.files[0]);
                        (e as any).target.value = null;
                      }}
                    />
                  </div>
                  <div
                    id="btn_drawing"
                    className={styles.btnAddDrawing}
                    onClick={() => {
                      setCanvasEditor((s) => ({
                        ...s,
                        show: true,
                        cb: (t, size) => {
                          setData(
                            latest.data.updateIn(
                              [...latest.path, 'imgs'],
                              (list) =>
                                list.push(
                                  fromJS({
                                    id: gen_id(),
                                    src: svgToDataURL(t),
                                    size: {
                                      width: size.width,
                                      height: size.height,
                                    },
                                  }),
                                ),
                            ),
                          );
                          setCanvasEditor((s) => ({ ...s, show: false }));
                        },
                      }));
                    }}
                  >
                    添加绘图
                  </div>
                </div>
              )}
            </div>
            <div
              id="btn_remove_node"
              className={styles.btnRemove}
              onClick={() => {
                if (latest.path.length) {
                  sizesRef.current = sizesRef.current.deleteIn(latest.path);
                  setData(latest.data.deleteIn(latest.path));
                }
                unselect();
              }}
            >
              删除
            </div>
          </div>
          <textarea
            className={styles.nameInput}
            ref={inputRef}
            onKeyDown={input_on_keydown}
            autoFocus={selectedUI.show}
            onInput={input_on_input}
            onBlur={input_on_blur}
          />
        </div>
        {canvasEditor.show ? (
          <React.Suspense fallback={<div>...</div>}>
            <CanvasEditor
              img={canvasEditor.img}
              slideWidth={slideWidth}
              onCommit={(e, size) => {
                canvasEditor.cb(e, size);
              }}
              onClose={() => setCanvasEditor((s) => ({ ...s, show: false }))}
            />
          </React.Suspense>
        ) : null}
        {sharingDialog.show ? (
          <div className={styles.sharingDialog}>
            <div
              className={styles.btn}
              onClick={() => {
                setSharingDialog((s) => ({
                  ...s,
                  show: false,
                }));
              }}
            >
              关闭
            </div>
            <div>
              上传状态：
              {sharingDialog.current === sharingDialog.total
                ? '已完成'
                : '上传中'}
            </div>
            <div>
              已上传：{sharingDialog.current}/{sharingDialog.total}
            </div>
            <div>
              共享节点地址：
              <span style={{ userSelect: 'all' }}>{sharingDialog.hash}</span>
            </div>
            <div>
              共享节点网址：
              <span style={{ userSelect: 'all' }}>
                https://mindslide.cn/#{sharingDialog.hash}
              </span>
            </div>
            <div>三种使用方法：</div>
            <div>(a) 使用共享节点地址插入节点</div>
            <div>(b) 使用共享节点地址导入项目</div>
            <div>(c) 使用共享节点网址</div>
          </div>
        ) : null}
      </div>
      <div
        className={styles.zoomOut}
        onClick={(e) => {
          e.stopPropagation();
          const new_scale = Math.max(scale - 0.1, 0.2);
          update_sizes(latest.data, new_scale, projectId);
          setScale(new_scale);
        }}
      >
        -
      </div>
      <div
        className={styles.zoomIn}
        onClick={(e) => {
          e.stopPropagation();
          const new_scale = scale + 0.1;
          update_sizes(latest.data, new_scale, projectId);
          setScale(new_scale);
        }}
      >
        +
      </div>
    </div>
  );
};
