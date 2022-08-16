import React, { Component, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';

import { MindEditor } from './mind-editor';
import styles from './index.less';
import { DataRAW, LINE_WIDTH } from './common';
import {
  get_first_project,
  delete_project,
  clone_data,
  defaultDataJSON,
  get_project_names,
  get_project,
  init,
  get_project_ids,
  save_project,
  compute_text_size,
  export_offline,
  export_slide,
  export_mind,
  gen_id,
  retrieve,
  export_anki,
  compute_node_size,
} from './utils';
import { SlideView } from './slide';
import { fromJS } from 'immutable';

const MindExportEditor = React.lazy(
  () => import(/* webpackChunkName: "text-editor" */ './text-editor'),
);
const defaultOffset = { x: 120, y: 150 };
const defaultScale = 0.6;
let tempRichText = '';
const MindExportType = {
  mindslide: 'MindSlide文件',
  rich: '富文本',
  text: '纯文本',
  svg: 'SVG文件',
  png: 'PNG文件',
  card: 'Anki记忆卡片',
  ppt: 'PPT文件',
  offline: '离线html',
};

const MindImportType = {
  mindslide: 'MindSlide文件',
  rich: '富文本',
  text: '纯文本',
  hash: '共享节点地址',
};

function extract_offset(e) {
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
  return offset;
}

let latest_mouse_down;
let mouse_down = false;
let latest_width;
function spliter_on_mouse_up(e) {
  mouse_down = false;
}

const defaultText = `
* 例子
  * A
  * B
    * C
  * D
`;

const Main = () => {
  const [scale, setScale] = useState(defaultScale);
  const [loading, setLoading] = useState(false);
  const project_names = get_project_names();
  const [project, setProject] = useState({
    id: get_project_ids()[0],
    name: project_names[get_project_ids()[0]],
    data: get_first_project(),
  });
  const [slideWidth, setSlideWidth] = useState(250);
  const [importText, setImportText] = useState(defaultText);
  const [showProjectSelectList, setShowProjectSelectList] = useState(true);

  const [mindRadioType, setMindRadio] = useState(
    Object.keys(MindExportType)[0],
  );
  const [mindImportExportDialog, setMindImportExportDialog] = useState({
    show: false,
    import: false,
  });

  async function import_from_rich_text(html) {
    const e = document.createElement('div');
    e.innerHTML = html;

    function s(d, res = {} as any) {
      res.name = d.firstChild.data.trim();
      res.id = gen_id();
      res.imgs = [];
      res.children = [];
      for (let i = 0; i < d.childNodes.length; ++i) {
        if (d.childNodes[i].tagName === 'UL') {
          for (let j = 0; j < d.childNodes[i].children.length; ++j) {
            res.children.push(s(d.childNodes[i].children[j]));
          }
        }
      }
      return res;
    }
    const t = s((e as any).firstElementChild.firstElementChild);
    await new_project(t);
  }
  const export_img = useCallback(
    async (type: 'png' | 'svg') => {
      const sizes = compute_node_size({
        data: project.data,
        scale,
      });
      const size = sizes.get('size');
      const node = (document.getElementById('workspace') as any).firstChild;
      const top = node.style.top;
      const left = node.style.left;
      const domtoimage = await import(
        /* webpackChunkName: "dom-to-image" */ 'dom-to-image'
      );

      let t = sizes;
      let min_offset_y = 0;
      while (t.get('children').size) {
        min_offset_y += t.getIn(['child_offsets', '0', 'y']);
        t = t.getIn(['children', '0']);
      }
      node.style.left = 0;
      node.style.top = -min_offset_y + 'px';

      const fn = type === 'svg' ? domtoimage.toSvg : domtoimage.toPng;
      fn(node, {
        height: size.get('height'),
        width: size.get('width'),
      }).then(function (dataUrl) {
        node.style.left = left;
        node.style.top = top;

        const link = document.createElement('a');
        link.download = project.data.get('name') + '.png';
        link.href = dataUrl;
        link.click();
      });
    },
    [project, scale],
  );
  async function import_from_text(text) {
    const indent = text.indexOf('\t') > 0 ? '\t' : '  ';
    function s(d, line = 0, res = {} as any) {
      res.name = d[line][1].trim();
      const child = [];
      const depth = d[line][0];
      for (let i = line + 1; i < d.length; ++i) {
        if (d[i][0] === depth + 1) {
          child.push(i);
        } else if (d[i][0] <= depth) {
          break;
        }
      }
      res.id = gen_id();
      res.imgs = [];
      res.children = child.map((i) => s(d, i, {}));
      return res;
    }
    const r = s(
      text
        .split('\n')
        .map((i) => {
          const index = i.indexOf('*');
          if (index === -1) {
            return undefined;
          }
          return [index / indent.length, i.substr(index + 1)];
        })
        .filter((i) => i),
    );
    await new_project(r);
  }
  React.useEffect(() => {
    save_project(project.id, project.data);
  }, [project]);

  React.useEffect(() => {
    const d = (window as any).global_default_project;
    if (d) {
      console.log('load from global_default_project');
      new_project(d);
    } else if (location.hash) {
      console.log('load from location hash');
      setLoading(true);
      const h = location.hash.substr(1);
      location.hash = '';
      retrieve(h).then((new_data) => {
        setLoading(false);
        if (new_data) {
          new_project(new_data).then();
        } else {
          setLoading(false);
          alert('地址错误');
        }
      });
    } else {
      console.log('load from default');
    }
  }, []);

  function spliter_on_mouse_down(e) {
    latest_mouse_down = extract_offset(e);
    latest_width = slideWidth;
    mouse_down = true;
  }

  function radioOnChange(e) {
    setMindRadio(e.target.value);
  }

  async function load_from_mindslide(d) {
    await new_project(d.content);
  }

  const [offset, setOffset] = useState(defaultOffset);

  async function new_project(d) {
    const newDefaultData = clone_data(d);
    const id = newDefaultData.id;
    get_project_ids().push(id);
    await save_project(id, newDefaultData);
    get_project_names()[id] = d.name;
    await setProjectUI(id);
    setShowProjectSelectList(!showProjectSelectList);
    setOffset(defaultOffset);
  }

  function spliter_on_mouse_move(e) {
    if (!mouse_down) {
      return;
    }
    const offset = extract_offset(e);
    const new_width = Math.min(
      800,
      Math.max(latest_width - offset.x + latest_mouse_down.x, 100),
    );
    setSlideWidth(new_width);
  }

  const projectListWidth = Object.keys(project_names).reduce(
    (m, x) => Math.max(compute_text_size(project_names[x]).width + 20, m),
    100,
  );
  const setProjectUI = async (i) => {
    setProject({
      id:i ,
      name:get_project_names()[i],
      data:fromJS(await get_project(i))
    })
    setShowProjectSelectList(!showProjectSelectList);
    setOffset(defaultOffset);
  };
  return (
    <div
      className={styles.main}
      onMouseMove={spliter_on_mouse_move}
      onMouseUp={spliter_on_mouse_up}
    >
      <MindEditor
        projectId={project.id}
        slideWidth={slideWidth}
        data={project.data}
        setData={(data) => {
          setProject((s) => ({
            ...s,
            name: data.get('name'),
            data,
          }));
        }}
        scale={scale}
        setScale={setScale}
        offset={offset}
        setOffset={setOffset}
      />
      <div
        className={styles.spliter}
        onMouseDown={spliter_on_mouse_down}
        style={{ right: slideWidth }}
      />
      <div className={styles.projectSelect} style={{ width: projectListWidth }}>
        <div
          className={styles.projectListItem}
          onClick={() => {
            setShowProjectSelectList(!showProjectSelectList);
          }}
        >
          {project.name}
        </div>
        {showProjectSelectList ? (
          <div className={styles.projectList}>
            {Object.keys(project_names).map((i) => (
              <div
                key={i}
                className={styles.projectListItem}
                style={
                  i === project.id
                    ? {
                        background: '#eee',
                      }
                    : {}
                }
                onClick={async () => {
                  if (project.id === i) {
                    return;
                  }
                  await setProjectUI(i);
                }}
              >
                {i === project.id ? project.name : project_names[i]}
                <div
                  id="btn_delete_project"
                  className={styles.btnDeleteProject}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (Object.keys(project_names).length === 1) {
                      alert('无法删除唯一项目');
                      return;
                    }
                    await delete_project(i);
                    await setProjectUI(get_project_ids()[0]);
                  }}
                >
                  ✕
                </div>
              </div>
            ))}
            <div
              key={'__new__'}
              id="btn_new_empty_project"
              onClick={async () => {
                await new_project({
                  name: '未命名',
                  id: '',
                  children: [],
                  imgs: [],
                });
              }}
              className={styles.projectListItem}
            >
              新建空项目
            </div>
            <div
              key={'__new_example__'}
              id="btn_new_example"
              onClick={async () => {
                await new_project(defaultDataJSON);
              }}
              className={styles.projectListItem}
            >
              新建示例
            </div>
          </div>
        ) : null}
      </div>
      <SlideView width={slideWidth} data={project.data} />
      <div
        id="btn_main_import"
        className={styles.btnImportMind}
        style={{ right: slideWidth }}
        onClick={(e) => {
          tempRichText = dataToMindHTML(project.data);
          setMindImportExportDialog({
            show: true,
            import: true,
          });
        }}
      >
        导入
      </div>
      <img
        style={{ right: slideWidth + 20, position: 'absolute', bottom: 20, cursor: 'pointer' }}
        height={20}
        onClick={() => {
          window.open('https://github.com/mind-slide/mind-slide.github.io', '_blank');
        }}
        src="https://img.shields.io/github/stars/mind-slide/mind-slide.github.io?style=social"
      />
      <div
        id="btn_main_export"
        className={styles.btnExportMind}
        style={{ right: slideWidth }}
        onClick={(e) => {
          setMindImportExportDialog({
            show: true,
            import: false,
          });
        }}
      >
        导出
      </div>
      {mindImportExportDialog.show ? (
        <div className={styles.mindPreviewDialog}>
          <div className={styles.mindPreviewTop}>
            <div
              className={styles.btn}
              onClick={(e) => {
                setMindImportExportDialog({
                  show: false,
                  import: false,
                });
                setMindRadio(Object.keys(MindExportType)[0]);
              }}
            >
              关闭
            </div>
          </div>
          <form style={{ marginBottom: 10 }}>
            {Object.keys(
              mindImportExportDialog.import ? MindImportType : MindExportType,
            ).map((i) => (
              <React.Fragment key={i}>
                <span>
                  {
                    (mindImportExportDialog.import
                      ? MindImportType
                      : MindExportType)[i]
                  }
                </span>
                <input
                  type="radio"
                  checked={mindRadioType === i}
                  name="output"
                  value={i}
                  onChange={radioOnChange}
                />
              </React.Fragment>
            ))}
          </form>
          <div className={styles.mindPreviewContent}>
            <div>
              <div></div>
              {mindRadioType === 'mindslide' ? (
                !mindImportExportDialog.import ? (
                  <div
                    className={styles.btn}
                    id={'btn_export_mindslide'}
                    onClick={() => {
                      export_mind(project.data, project.data.get('name'));
                    }}
                  >
                    导出MindSlide文件
                  </div>
                ) : (
                  <input
                    id={'btn_import_mindslide'}
                    className={styles.importMindSlide}
                    onChange={(e) => {
                      const file = e.currentTarget.files[0];
                      const reader = new FileReader();
                      reader.onload = () => {
                        load_from_mindslide(JSON.parse((reader as any).result));
                        setMindImportExportDialog({
                          show: false,
                          import: false,
                        });
                      };
                      reader.readAsText(file);
                    }}
                    type="file"
                  />
                )
              ) : null}
              {mindRadioType === 'ppt' ? (
                <div
                  id="btn_export_ppt"
                  className={styles.btn}
                  onClick={() => {
                    export_slide(project.data.get('name'));
                  }}
                >
                  导出PPT文件
                </div>
              ) : null}
              {mindRadioType === 'rich' ? (
                <React.Fragment>
                  <React.Suspense fallback={<div>...</div>}>
                    <MindExportEditor
                      value={
                        mindImportExportDialog.import
                          ? tempRichText
                          : dataToMindHTML(project.data)
                      }
                      onChange={(v) => {
                        if (mindImportExportDialog.import) {
                          tempRichText = v;
                        }
                      }}
                    />
                  </React.Suspense>
                  {mindImportExportDialog.import ? (
                    <div
                      className={styles.btn}
                      id={
                        !mindImportExportDialog.import
                          ? 'btn_export_rich'
                          : 'btn_import_rich'
                      }
                      onClick={() => {
                        import_from_rich_text(tempRichText);
                        setMindImportExportDialog({
                          show: false,
                          import: false,
                        });
                      }}
                    >
                      导入
                    </div>
                  ) : null}
                </React.Fragment>
              ) : null}
              {mindRadioType === 'text' ? (
                <React.Fragment>
                  <textarea
                    className={styles.mindPreviewText}
                    onChange={(e) => {
                      if (mindImportExportDialog.import) {
                        setImportText(e.target.value);
                      }
                    }}
                    value={
                      mindImportExportDialog.import
                        ? importText
                        : dataToMindText(project.data)
                    }
                  />
                  {mindImportExportDialog.import ? (
                    <div
                      className={styles.btn}
                      id={
                        !mindImportExportDialog.import
                          ? 'btn_export_text'
                          : 'btn_import_text'
                      }
                      onClick={() => {
                        import_from_text(importText);
                        setMindImportExportDialog({
                          show: false,
                          import: false,
                        });
                      }}
                    >
                      导入
                    </div>
                  ) : null}
                </React.Fragment>
              ) : null}
              {mindRadioType === 'hash' ? (
                <div
                  id="btn_import_hash"
                  className={styles.btn}
                  onClick={async () => {
                    const addr = prompt('输入共享节点地址');
                    if (!addr) {
                      return;
                    }
                    setLoading(true);
                    const d = await retrieve(addr);
                    setLoading(false);
                    console.log(d);
                    if (!d) {
                      alert('地址错误');
                    } else {
                      await new_project(d);
                    }
                    setMindImportExportDialog({
                      import: false,
                      show: false,
                    });
                  }}
                >
                  从共享节点地址导入
                </div>
              ) : null}
              {mindRadioType === 'png' ? (
                <div
                  className={styles.btn}
                  onClick={async () => {
                    export_img('png');
                  }}
                >
                  导出PNG文件
                </div>
              ) : null}
              {mindRadioType === 'svg' ? (
                <div
                  className={styles.btn}
                  id="btn_export_svg"
                  onClick={async () => {
                    export_img('svg');
                  }}
                >
                  导出SVG文件
                </div>
              ) : null}
              {mindRadioType === 'offline' ? (
                <div
                  id="btn_export_offline"
                  className={styles.btn}
                  onClick={() => {
                    export_offline(project.data, project.data.get('name'));
                  }}
                >
                  导出离线html文件
                </div>
              ) : null}
              {mindRadioType === 'card'
                ? (() => {
                    const d = project.data;
                    const cards = dataToCards(d);
                    const conflicts = {};
                    Object.keys(cards).forEach((i) => {
                      if (cards[i].conflict) {
                        conflicts[cards[i].name] = true;
                      }
                    });
                    return (
                      <React.Fragment>
                        <table>
                          <thead>
                            <tr>
                              <th>Front</th>
                              <th>Back</th>
                              <th>Front别名(可选)</th>
                              <th>忽略</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(cards).map((i) => (
                              <tr key={i}>
                                <td
                                  style={{
                                    color: cards[i].conflict ? 'red' : 'black',
                                  }}
                                >
                                  {cards[i].name}
                                </td>
                                <td>
                                  {cards[i].htmls.map((j) => (
                                    <div
                                      dangerouslySetInnerHTML={{ __html: j }}
                                    ></div>
                                  ))}
                                </td>
                                <td>
                                  <input
                                    value={
                                      d.getIn(cards[i].path).get('alias') || ''
                                    }
                                    onInput={(e) => {
                                      setProject((s) => ({
                                        ...s,
                                        data: d.setIn(
                                          [...cards[i].path, 'alias'],
                                          e.currentTarget.value,
                                        ),
                                      }));
                                    }}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={d
                                      .getIn(cards[i].path)
                                      .get('ignore')}
                                    onChange={(e) => {
                                      setProject((s) => ({
                                        ...s,
                                        data: d.setIn(
                                          [...cards[i].path, 'ignore'],
                                          !d.getIn(cards[i].path).get('ignore'),
                                        ),
                                      }));
                                    }}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {Object.keys(conflicts).length ? (
                          <div>
                            存在相同的Front(
                            {Object.keys(conflicts)
                              .map((i) => i)
                              .join(',')}
                            )，导出的卡片可能会被覆盖，建议使用别名
                          </div>
                        ) : null}
                        <div
                          id="btn_export_card"
                          className={styles.btn}
                          onClick={() => {
                            export_anki(project.data, cards);
                          }}
                        >
                          导出知识卡片
                        </div>
                      </React.Fragment>
                    );
                  })()
                : null}
            </div>
          </div>
        </div>
      ) : null}
      {loading ? (
        <div className={styles.dialog}>
          <div
            className={styles.dialogContent}
            style={{
              width: 100,
              height: 30,
              lineHeight: '30px',
              textAlign: 'center',
            }}
          >
            下载中
          </div>
        </div>
      ) : null}
    </div>
  );
};

function dataToMindHTML(data) {
  function toMindHTML(d, parent) {
    const i = document.createElement('li');
    i.innerText = d.get('name');
    let ul;
    if (d.get('children').size) {
      ul = document.createElement('ul');
      i.appendChild(ul);
    }
    parent.appendChild(i);
    d.get('children').forEach((j) => toMindHTML(j, ul));
  }
  const e = document.createElement('ul');
  toMindHTML(data, e);
  return `<meta charset='utf-8'>${e.innerHTML}`;
}

function dataToMindText(data) {
  const res = [];
  function toMindText(d, prefix = '') {
    res.push(prefix + '* ' + d.get('name'));
    d.get('children').map((i) => toMindText(i, prefix + '  '));
  }
  toMindText(data);
  return res.join('\n');
}

function dataToCards(data) {
  const m = {};
  const conflict = {};
  const res = {} as {
    [id: string]: {
      htmls: string[];
      name: string;
      alias: string;
      conflict?: boolean;
      media: { name: string; data: any }[];
      path: any[];
    };
  };
  function s(d, path, parent_id) {
    const ignore = d.get('ignore');
    const name = d.get('name');
    const alias = d.get('alias');
    if (!ignore) {
      if (m[alias ? alias : name]) {
        conflict[alias ? alias : name] = true;
      }
      m[alias ? alias : name] = true;
    }
    const merge = d.get('merge');
    const id = d.get('id');

    const img_to_src = {};
    const media = d
      .get('imgs')
      .toJS()
      .map((img) => {
        const dataUrl = img.src.split(',');
        const base64 = dataUrl[1];
        const bin = atob(base64);
        const length = bin.length;
        const buf = new ArrayBuffer(length);
        const arr = new Uint8Array(buf);
        bin.split('').forEach((e, i) => (arr[i] = e.charCodeAt(0)));

        const img_name = `${id}-img-${Math.random()}`;
        img_to_src[img_name] = img.src;
        return { name: img_name, data: buf };
      });
    const imgs = media.map((i) => `<img src="${img_to_src[i.name]}"/>`);
    if (merge) {
      res[id] = {
        htmls: [dataToMindHTML(d), ...imgs],
        name,
        path,
        alias,
        media,
      };
    } else {
      if (d.get('children').size) {
        res[id] = {
          htmls: [...d.get('children').map((i) => i.get('name')), ...imgs],
          name,
          path,
          alias,
          media,
        };
        d.get('children').forEach((i, index) =>
          s(i, [...path, 'children', index], id),
        );
      } else if (media.length) {
        res[parent_id].htmls.push(...imgs);
        res[parent_id].media.push(...media);
      }
    }
  }
  s(data, [], '');
  Object.keys(res).forEach((i) => {
    res[i].conflict = !!conflict[res[i].name];
  });
  return res;
}

init().then(() => {
  ReactDOM.render(<Main />, document.getElementById('main'), () => {});
});
