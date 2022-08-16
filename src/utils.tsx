import {
  MAX_TEXT_WIDTH,
  Offset,
  DataRAW,
  DIS_PARENT_CHILDREN,
  MIN_DIS_SIB,
  Data,
  Size,
  NODE_TEXT_PADDING,
} from './common';
import { useState as useState_, useRef, useEffect } from 'react';
import md5 from 'blueimp-md5';
import { Map, fromJS } from 'immutable';
import { default_data } from './default-data';
import multibase from 'multibase';
import axios from 'axios';
import { saveAs } from 'file-saver';

const version = 1;
let db_req;
let db;
const database_name = `mindslide-${version}`;
export async function initDB() {
  console.log('init db');
  if (window.indexedDB) {
    await new Promise<void>((resolve) => {
      db_req = window.indexedDB.open(database_name);
      db_req.onerror = function (event) {
        alert('本地存储功能异常');
        resolve();
      };
      db_req.onsuccess = function (event) {
        console.log('init db success');
        db = db_req.result;
        resolve();
      };
      db_req.onupgradeneeded = function (event) {
        console.log('init db onupgradeneeded');
        db = event.target.result;
        if (!db.objectStoreNames.contains(database_name)) {
          console.log('init db onupgradeneeded createObjectStore');
          db.createObjectStore(database_name, { keyPath: 'id' });
        }
      };
    });
  } else {
    alert('本地存储功能异常');
  }
}
export async function writeDB(k, v) {
  const request = db
    .transaction([database_name], 'readwrite')
    .objectStore(database_name)
    .put({ id: k, v });

  await new Promise<void>((resolve) => {
    request.onsuccess = function (event) {
      resolve();
    };
    request.onerror = function (event) {
      resolve();
    };
  });
}

export async function getDB(k) {
  const request = db
    .transaction([database_name], 'readwrite')
    .objectStore(database_name)
    .get(k);

  return await new Promise((resolve) => {
    request.onsuccess = function (event) {
      resolve(request.result.v);
    };
  });
}

export async function deleteDB(k) {
  const request = db
    .transaction([database_name], 'readwrite')
    .objectStore(database_name)
    .delete(k);

  return await new Promise<void>((resolve) => {
    request.onsuccess = function (event) {
      resolve();
    };
  });
}

export async function getDBkeys() {
  const objectStore = db.transaction(database_name).objectStore(database_name);

  return await new Promise((resolve) => {
    const ids = [];
    objectStore.openCursor().onsuccess = function (event) {
      const cursor = event.target.result;

      if (cursor) {
        ids.push(cursor.key);
        cursor.continue();
      } else {
        resolve(ids);
      }
    };
  });
}

export const defaultDataJSON = default_data;

export const defaultData: any = fromJS(clone_data(defaultDataJSON));

const x = {
  project_ids: [],
  project_names: [],
  first_project: undefined,
} as {
  project_ids: string[];
  project_names: string[];
  first_project: any;
}
export async function init() {
  console.log('init');
  await initDB();
  x.project_ids = (await getDBkeys()) as any;
  if (!x.project_ids.length) {
    console.log('init defaultDataJSON');
    x.project_ids.push(defaultData.get('id'));
    await save_project(defaultData.get('id'), defaultData);
    x.project_ids = (await getDBkeys()) as any;
  }
  x.project_names = (await get_project_names_from_db()) as any;
  x.first_project = fromJS((await get_project(x.project_ids[0])) as any);
  console.log('init finished');
}
export function get_first_project() {
  return x.first_project;
}
export function get_project_ids() {
  return x.project_ids;
}
export const get_project_names = () => {
  return x.project_names;
};
export async function get_project_names_from_db() {
  const names = await Promise.all(
    get_project_ids().map(async (i) => {
      const res = (await getDB(i)) as any;
      return res.name;
    }),
  );
  return get_project_ids().reduce((m, i, index) => {
    m[i] = names[index];
    return m;
  }, {});
}

export const save_project = async (id, data: Data) => {
  await writeDB(id, data instanceof Map ? data.toJS() : data);
};
export const get_project = async (id) => {
  return await getDB(id);
};

export const delete_project = async (id) => {
  await deleteDB(id);
  x.project_ids.splice(x.project_ids.indexOf(id), 1);
  delete x.project_names[id];
};

export const img_stop_propagation_events = {
  onMouseUp: (e) => e.stopPropagation(),
  onMouseDown: (e) => e.stopPropagation(),
  onTouchStart: (e) => e.stopPropagation(),
  onTouchEnd: (e) => e.stopPropagation(),
};

const size_cache: {
  [name: string]: Size;
} = {};

export function compute_text_size(
  text: string,
  options = {
    max_width: MAX_TEXT_WIDTH,
    style: '',
  },
) {
  const cache_id = text + 'ƒøƒ' + options.style;
  if (size_cache[cache_id]) {
    return size_cache[cache_id];
  }
  const e = document.createElement('span');
  e.innerText = text;
  e.setAttribute(
    'style',
    'position:absolute;top:100%;word-break:break-all;white-space:nowrap;' +
      options.style,
  );
  document.body.appendChild(e);
  let text_width = Math.max(e.offsetWidth, 19);
  if (text_width > options.max_width) {
    e.innerText = text;
    e.setAttribute(
      'style',
      `position:absolute;top:100%;width:${options.max_width}px;word-break:break-all;${options.style}`,
    );
    text_width = Math.max(e.offsetWidth, 19);
  }
  const size = {
    width: text_width + NODE_TEXT_PADDING * 2,
    height: Math.max(e.offsetHeight, 19),
  };
  size_cache[cache_id] = size;
  document.body.removeChild(e);
  return size;
}

export function compute_node_size({
  data,
  scale,
}: {
  data: Data;
  scale: number;
}): Map<string, any> {
  const name = data.get('name');
  const children = data.get('children');
  const imgs = data.get('imgs');
  const node_text_size = compute_text_size(name);
  const n_child = children ? children.size : 0;
  if (n_child === 0) {
    return fromJS({
      size: {
        width: node_text_size.width,
        height: node_text_size.height + (imgs.size ? 50 : 0),
      },
      text_size: node_text_size,
      child_offsets: [],
      children: [],
    });
  }
  let child_sizes = children.map((i, idx) =>
    compute_node_size({
      data: i,
      scale,
    }),
  );
  const child_size: Size = {
    height:
      (n_child - 1) * MIN_DIS_SIB * scale +
      child_sizes.reduce((m, i) => m + i.getIn(['size', 'height']), 0),
    width: child_sizes.reduce((m, i) => Math.max(m, i.getIn(['size', 'width'])), 0),
  };

  const node_size: Size = {
    height: Math.max(node_text_size.height + (imgs.size ? 50 : 0), child_size.height),
    width:
      child_size.width + node_text_size.width + DIS_PARENT_CHILDREN * scale,
  };

  let child_offsets: Offset[] = [];
  for (let i = 0, o = -node_size.height / 2; i < child_sizes.size; ++i) {
    const h = child_sizes.getIn([i, 'size', 'height']);
    const offset: Offset = {
      x: DIS_PARENT_CHILDREN * scale,
      y:
        o +
        i * MIN_DIS_SIB * scale +
        h / 2 -
        node_text_size.height,
    };

    child_offsets.push(offset);
    o += h;
  }

  const res = fromJS({
    text_size: node_text_size,
    size: node_size,
    child_offsets, // 相对 parent
    children: child_sizes,
  });
  return res;
}

export function dis2d(a: Offset, b: Offset) {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
}

export const get_global_offset = (d: HTMLElement, root = document.body) => {
  let offset_x = 0;
  let offset_y = 0;
  while (d && d !== root) {
    offset_x += d.offsetLeft;
    offset_y += d.offsetTop;
    d = d.offsetParent as HTMLElement;
  }
  return {
    x: offset_x,
    y: offset_y,
  };
};

export function gen_id() {
  return `${Math.random().toString(16).substr(2)}`;
}

export function arr_equals(a: any[], b: any[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export function permutation(arr: any[], f: Function) {
  function do_permutation(a: any[], index: number) {
    if (index >= a.length) {
      f(a);
      return;
    }
    do_permutation(a, index + 1);
    for (let i = index + 1, t; i < a.length; ++i) {
      t = a[i];
      a[i] = a[index];
      a[index] = t;
      do_permutation(a, index + 1);
      t = a[i];
      a[i] = a[index];
      a[index] = t;
    }
  }
  do_permutation(arr, 0);
}

export function deep_clone(a) {
  if (a instanceof Array) {
    return a.map((i) => deep_clone(i));
  } else if (typeof a === 'object') {
    return Object.keys(a).reduce((m, i) => {
      m[i] = deep_clone(a[i]);
      return m;
    }, {});
  }
  return a;
}

export const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t));

export function rearrange_imgs(imgs, prefer_horizontal = true) {
  let min_x = Infinity;
  let candidate_imgs;
  let candidate_w;
  let candidate_is_horizontal = false;
  let candidate_h;
  function assess(_imgs, width, height) {
    const imgs = deep_clone(_imgs);
    const pow = Math.pow;
    const ratio = (100 * 100) / (width * height);
    width *= ratio;
    height *= ratio;
    // 标准化
    imgs.forEach((i) => {
      i.size.width *= ratio;
      i.size.height *= ratio;
      i.offset.x *= ratio;
      i.offset.y *= ratio;
    });
    // img面积均值
    const avg =
      imgs.reduce((m, i) => m + i.size.width * i.size.height, 0) / imgs.length;
    // 方差
    const x = imgs.reduce(
      (m, i) => m + pow(i.size.width * i.size.height - avg, 2),
      0,
    );
    const has_zero = imgs.filter(
      (i) => (i.size.width * i.size.height) / (height * width) < 0.05,
    ).length;

    function update_candidate() {
      min_x = x;
      candidate_imgs = imgs;
      candidate_w = width;
      candidate_h = height;
    }
    if (prefer_horizontal && width > height) {
      if (
        !candidate_is_horizontal ||
        (candidate_is_horizontal && x < min_x && !has_zero)
      ) {
        update_candidate();
        candidate_is_horizontal = true;
      }
    } else if (!candidate_is_horizontal && x < min_x && !has_zero) {
      update_candidate();
    }
  }
  permutation(imgs, (new_imgs) => {
    let w = 0;
    let h = 0;
    function search(i) {
      if (i === new_imgs.length) {
        assess(new_imgs, w, h);
        return;
      }
      let new_h;
      let new_w;
      const img = new_imgs[i];
      // fit width
      new_h = (img.size.height / img.size.width) * w;
      img.offset = { x: 0, y: h };
      h += new_h;
      img.size.width = w;
      img.size.height = new_h;
      search(i + 1);
      h -= new_h;
      // fit height
      new_w = (img.size.width / img.size.height) * h;
      img.offset = { x: w, y: 0 };
      w += new_w;
      img.size.width = new_w;
      img.size.height = h;
      search(i + 1);
      w -= new_w;
    }
    w = new_imgs[0].size.width;
    h = new_imgs[0].size.height;
    new_imgs[0].offset = { x: 0, y: 0 };
    search(1);
  });
  return {
    imgs: candidate_imgs,
    w: candidate_w,
    h: candidate_h,
  };
}

export function svg_to_png(svg) {
  const canvas = document.createElement('canvas');
  canvas.width = svg.naturalWidth;
  canvas.height = svg.naturalHeight;
  const canvasCtx = canvas.getContext('2d');
  canvasCtx.drawImage(svg, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function export_slide(name: string) {
  const { default: pptxgen } = await import(
    /* webpackChunkName: "pptxgenjs" */ 'pptxgenjs'
  );
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';

  const slides = document.querySelectorAll('[data-slide-content]');

  const slide_size = {
    width: 1280,
    height: 720,
  };
  slides.forEach((slide_dom) => {
    const slide = pres.addSlide();
    const parentColor = (slide_dom as any).style.color
      .split('(')[1]
      .split(',')
      .map((i) => {
        const a = parseInt(i).toString(16);
        return a.length > 1 ? a : `0${a}`;
      })
      .join('');
    const bg = (slide_dom as any).style.background
      .split('(')[1]
      .split(',')
      .map((i) => {
        const a = parseInt(i).toString(16);
        return a.length > 1 ? a : `0${a}`;
      })
      .join('');
    slide.background = { fill: bg };
    slide_dom.querySelectorAll('img').forEach((img_dom) => {
      const offset = get_global_offset(img_dom as any, slide_dom as any);
      let src = img_dom.getAttribute('src');
      const isSVG = src.startsWith('data:image/svg+xml,');
      if (isSVG) {
        src = svg_to_png(img_dom);
      }

      slide.addImage({
        x: `${(offset.x / slide_size.width) * 100}%`,
        y: `${(offset.y / slide_size.height) * 100}%`,
        w: `${(img_dom.width / slide_size.width) * 100}%`,
        h: `${(img_dom.height / slide_size.height) * 100}%`,
        data: src,
      });
    });
    slide_dom.querySelectorAll('div').forEach((text_dom) => {
      const offset = get_global_offset(text_dom as any, slide_dom as any);
      const font_size = Math.floor(
        (parseInt(text_dom.style.fontSize) * 17) / 28,
      );
      let compensation = Array.from(text_dom.innerText).reduce(
        (m, i) => m + (is_quanjiao(i) ? 0 : 3),
        0,
      ); // px
      if (offset.x + compensation > slide_size.width) {
        compensation = 0;
      }
      const color = (text_dom as any).style.color.indexOf('(') > 0 ? (text_dom as any).style.color
        .split('(')[1]
        .split(',')
        .map((i) => {
          const a = parseInt(i).toString(16);
          return a.length > 1 ? a : `0${a}`;
        })
        .join('') : parentColor;
      const line_height = parseInt(text_dom.style.lineHeight);
      const textboxOpts = {
        x: `${((offset.x / slide_size.width) * 100).toFixed(2)}%`,
        y: `${((offset.y / slide_size.height) * 100).toFixed(2)}%`,
        w: `${Math.max(
          Math.ceil(
            ((text_dom.clientWidth + compensation) / slide_size.width) * 100,
          ),
          20,
        )}%`,
        h: `${(text_dom.clientHeight / slide_size.height) * 100}%`,
        charSpacing: 1,
        fontSize: font_size,
        fontFace: '黑体',
        color,
        // fill: { color:'F1F1F1' },
        valign: 'top',
      };
      slide.addText(text_dom.innerText, textboxOpts as any);
    });
  });

  pres.writeFile((name || 'slide') + '.pptx');
}

export function export_mind(data, name: string) {
  save_to_file(
    name + '.mindslide',
    JSON.stringify({
      version,
      content: data.toJS(),
    }),
  );
}

function is_quanjiao(str) {
  return str.match(/^[\u0000-\u00ff]/) == null;
}
export const save_to_file = (
  filename,
  content,
  content_type = 'text/plain',
) => {
  const a = document.createElement('a');
  const file = new Blob([content], { type: content_type });
  a.href = URL.createObjectURL(file);
  a.download = filename;
  a.click();
};

export const svgToDataURL = (svgStr) => {
  const encoded = encodeURIComponent(svgStr).replace(/'/g, '%27');

  const header = 'data:image/svg+xml,';
  const dataUrl = header + encoded;

  return dataUrl;
};

export const DataURLToSVG = (s) => {
  const header = 'data:image/svg+xml,';
  s = s.replace(header, '');
  s = s.replace(/%27/g, "'");
  return decodeURIComponent(s);
};

export async function export_offline(data, name: string) {
  let html = await (await fetch('index.html')).text();
  const css = await (await fetch('index.css')).text();
  const js = await (await fetch('index.js')).text();
  const chunks = [];

  for (let i of ['text-editor', 'canvas-editor', 'pptxgenjs']) {
    chunks.push(await (await fetch(`${i}.chunk.js`)).text());
    chunks.push(await (await fetch(`vendors~${i}.chunk.js`)).text());
  }
  // TODO dev
  chunks.push(await (await fetch('dom-to-image.chunk.js')).text());
  chunks.push(await (await fetch('vendors~anki~pptxgenjs.chunk.js')).text());
  chunks.push(
    await (await fetch('vendors~anki~canvas-editor~pptxgenjs.chunk.js')).text(),
  );

  html = html
    .split(
      `@script type="text/javascript" src="index.js">@/script>`.replace(
        /@/g,
        '<',
      ),
    )
    .join(
      '<' +
        'script>' +
        "window.global_default_project = JSON.parse(decodeURIComponent('" +
        encodeURIComponent(JSON.stringify(data.toJS())) +
        "'));" +
        js +
        '</' +
        'script>' +
        chunks.map((i) => '<' + 'script>' + i + '</' + 'script>').join('\n'),
    );
  html = html
    .split(`@link href="index.css" rel="stylesheet">`.replace(/@/g, '<'))
    .join('<' + 'style>' + css + '</' + 'style>');
  save_to_file(name + '.html', html, 'text/html');
}

export function hash(x) {
  const s = String.fromCharCode(
    ...multibase.encode('base58btc', new TextEncoder().encode(md5(x))),
  );
  return s.substr(0, 10);
}

export async function upload(data, onUpload = (a, b, c) => {}) {
  const data_js = data.toJS();
  const content = JSON.stringify(data_js);

  function s(d) {
    const info = {
      name: d.name,
      merge: d.merge,
      ignore: d.ignore,
      important: d.important,
      comment: d.comment,
      img_infos: d.imgs.map((i) => ({
        independent: i.independent,
        size: i.size,
      })),
      img_src_hashes: d.imgs.map((i) => hash(i.src)),
    };
    const dep = {
      children: d.children.map((i) => s(i)),
    };
    return {
      hash: hash(
        JSON.stringify({
          ...info,
          children_hashes: dep.children.map((i) => i.hash),
        }),
      ),
      info,
      ...dep,
      original: d,
    };
  }
  const data_hashed = s(data_js);

  async function exists(h) {
    const prefix = `-mindslide-${version}`;
    if (localStorage.getItem(`${prefix}${h}`)) {
      return true;
    }
    const a = await (await fetch('/exists/' + h)).json();
    if ((a as any).exists) {
      localStorage.setItem(`${prefix}${h}`, '1');
      return true;
    }
    return false;
  }

  async function do_upload(d) {
    const blob =
      typeof d === 'string'
        ? d
        : JSON.stringify({
            ...d.info,
            children_hashes: d.children.map((i) => i.hash),
          });
    const filename = typeof d === 'string' ? hash(d) : d.hash;
    await axios.post('/upload', {
      filename,
      blob,
    });
  }

  let total = 0;
  function count(d, r = [0]) {
    ++r[0];
    d.children.forEach((i) => count(i, r));
    r[0] += d.imgs.length;
    return r[0];
  }
  if (typeof data_js === 'object') {
    total = count(data_js);
  } else {
    total = 1;
  }

  let c = 0;
  const q = [data_hashed];
  const d_hash = data_hashed.hash;
  while (q.length) {
    const d = q.shift();
    console.log(d.original.name, d.hash, d.original.imgs.length);
    if (await exists(d.hash)) {
      console.log('exists: ', d.hash);
      c += count(d.original);
      onUpload(c, total, d_hash);
      continue;
    }
    for (let i = 0; i < d.children.length; ++i) {
      q.push(d.children[i]);
    }

    await Promise.all(d.original.imgs.map((i) => do_upload(i.src)));
    c += d.original.imgs.length;
    onUpload(c, total, d_hash);
    await do_upload(d);
    c++;
    onUpload(c, total, d_hash);
  }
}

export function clone_data(data) {
  const d = deep_clone(data);
  const f = (x) => {
    x.id = gen_id();
    x.imgs.forEach((i) => {
      i.id = gen_id();
    });
    x.children.forEach((i) => f(i));
  };
  f(d);
  return d;
}

export async function retrieve(h) {
  const { success, blob } = await (await fetch('/file/' + h)).json();
  if (!success) {
    return undefined;
  }
  let json;
  try {
    json = JSON.parse(blob);
  } catch (e) {
    return blob;
  }

  const t = {
    name: json.name,
    merge: json.merge,
    ignore: json.ignore,
    important: json.important,
    comment: json.comment,
    imgs: await Promise.all(
      json.img_infos.map(async (i, index) => ({
        ...i,
        src: (
          await (await fetch('/file/' + json.img_src_hashes[index])).json()
        ).blob,
      })),
    ),
    children: await Promise.all(
      json.children_hashes.map(async (i) => await retrieve(i)),
    ),
  };
  return clone_data(t);
}

export async function export_anki(data, cards) {
  const { default: AnkiExport } = await import(
    /* webpackChunkName: "anki" */ 'anki-apkg-export'
  );
  const apkg = new AnkiExport(data.get('name'));

  Object.keys(cards)
    .filter((i) => !data.getIn(cards[i].path).get('ignore'))
    .forEach((i) => {
      cards[i].media.forEach((j) => apkg.addMedia(j.name, j.data));
      apkg.addCard(
        cards[i].alias || cards[i].name,
        `<div style="text-align:left;">${cards[i].htmls.join('<br>')}</div>`,
      );
    });

  apkg
    .save()
    .then((zip) => {
      saveAs(zip, data.get('name') + '.apkg');
    })
    .catch((err) => console.log(err.stack || err));
}
