import React, { useState } from 'react';
import styles from './index.less';
import { compute_text_size, rearrange_imgs, permutation } from './utils';
const n_img_per_slide = 3;
const template = require('./template.json');
/**
 * 生成规则:
 * 1. 按层级深度优先展示
 * 1.1 每个节点中展示它的子节点名字（仅一层）
 * 1.2 如果节点标记为'合并'，将所有子节点树状展开（仅文本）
 * 2. 如果节点有图片，在深入子节点前展示
 * 2.1 图片展示中每三张组成一张幻灯片
 * 2.2 图片可设置为独立展示
 *
 * 幻灯片类型:
 * 1. 仅标题（根节点）
 * 2. 标题加子内容（仅一层，仅文本）
 * 3. 标题加图片
 * 4. 标题加子内容（所有子内容树状展示，仅文本）
 * 5. 标题加图片加单行文本
 *
 * 排版规则：
 * 所有幻灯片类型：最小字号28，固定长宽比4：3, 10 x 7.5 inches, 960 * 720
 * 幻灯片类型1：标题居中
 * 幻灯片类型2与类型4：标题居左上，内容自适应字体大小，纵向排列
 * 幻灯片类型3：若干图片经过排版后，适配幻灯片内容框，居中展示
 * 幻灯片类型5：若干图片经过排版后，适配幻灯片内容框，在左侧50%居中展示，右侧50%文本
 *
 * 图片排版规则:
 * 通过搜索
 * 选择其中图片面积方差最小的排版方案将若干比例不同的图片拼成一个矩形
 * 倾向于生成宽大于长的矩形，有利于展示文字内容
 *
 **/

const important_color = 'rgb(255,0,0)';
const nonimportant_color = 'inherit';
const slide_size = {
  width: 1280,
  height: 720,
}; // css中需要同步
const letter_spacing = 1; // css中需要同步
const padding_bottom = 40;
const lr_padding = 120;
const title_height = 180;
const MAX_TITLE_TEXT_LENGTH = 30;
let prev_styles = '';
let prev_ele;
const resume = () => {
  prev_ele && prev_ele.setAttribute('style', prev_styles);
  window.removeEventListener('fullscreenchange', f);
  window.removeEventListener('keydown', fullscreenOnKeyDown);
}
const f = () => {
  if (!(document as any).fullscreenElement) {
    resume();
  }
};
const slide_fullscreen = (e) => {
  const target = e.firstElementChild;
  prev_styles = target.getAttribute('style');
  prev_ele = target;
  const ratio = parseInt(e.style.width) / parseInt(e.style.height);
  let fit_width = ratio * screen.height;
  let fit_height = screen.height;
  let left = (screen.width - fit_width) / 2;
  let top = 0;
  if (fit_width > screen.width) {
    fit_width = screen.width;
    fit_height = screen.width / ratio;
    left = 0;
    top = (screen.height - fit_height) / 2;
  }

  const scale = fit_width / slide_size.width;
  target.setAttribute(
    'style',
    `left: ${left}px;top: ${top}px;transform: scale(${scale});color: ${target.style.color};background: ${target.style.background}`,
  );
  window.addEventListener('fullscreenchange', f);
  window.addEventListener('keydown', fullscreenOnKeyDown);
  e.requestFullscreen();
};
const fullscreenOnKeyDown = (e) => {
  let i;
  if (e.key === 'ArrowRight') {
    i = (document as any).fullscreenElement.nextElementSibling;
  } else if (e.key === 'ArrowLeft') {
    const prev = (document as any).fullscreenElement.previousElementSibling;
    if (prev && prev.firstElementChild && prev.firstElementChild.getAttribute('data-slide-content')) {
      i = (document as any).fullscreenElement.previousElementSibling;
    }
  }
  if (i) {
    resume();
    slide_fullscreen(i);
  }
};
const BasicSlide = (props) => {
  const width = props.width;
  const height = (slide_size.height / slide_size.width) * width;
  return (
    <div
      className={styles.slide}
      style={{ width, height }}
      id="btn_play_slide"
      onClick={(e) => {
        if (!document.fullscreenEnabled) {
          alert('unsupported feature');
          return;
        }
        if ((document as any).fullscreenElement) {
          if (e.currentTarget.nextElementSibling) {
            resume();
            slide_fullscreen(e.currentTarget.nextElementSibling);
          }
          return;
        }
        slide_fullscreen(e.currentTarget);
      }}
    >
      <div
        className={styles.slideContent}
        data-slide-content
        style={{
          transform: `scale(${props.width / slide_size.width})`,
          color: template[props.template_name].color,
          background: template[props.template_name].background,
        }}
      >
        {props.firstSlide ? (
          <React.Fragment>
            <img
              className={styles.bg1}
              src={template[props.template_name].bg1}
            />
            <img
              className={styles.bg2}
              src={template[props.template_name].bg2}
            />
          </React.Fragment>
        ) : (
          <React.Fragment>
            <img
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
              }}
              src={template[props.template_name].bg3}
            />
            <img
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
              }}
              src={template[props.template_name].bg4}
            />
          </React.Fragment>
        )}
        {props.children}
      </div>
    </div>
  );
};

const ImgsSlide = (props) => {
  const title_overflow =
    props.parent && props.data.get('name').length >= MAX_TITLE_TEXT_LENGTH;
  const force_side_mode =
    props.parent &&
    props.data.get('imgs').size &&
    props.parent.get('children').size === 1;
  const side_mode = title_overflow || force_side_mode;
  const original_title = props.data.get('name');
  const title = props.validTitle;
  const color = props.data.get('important')
    ? important_color
    : nonimportant_color;
  const imgs = props.imgs;

  const a_imgs = imgs.toJS ? imgs.toJS() : imgs.map((i) => i.toJS());
  const toImmutable = imgs.reduce((m, i, index) => {
    m.set(a_imgs[index], i);
    return m;
  }, new Map());

  const independent_imgs = a_imgs.filter((i) => i.independent);
  const dependent_imgs = a_imgs.filter((i) => !i.independent);

  let independent_slides = [];
  if (
    independent_imgs.length > 1 ||
    (independent_imgs.length && dependent_imgs.length)
  ) {
    independent_slides = independent_imgs.map((i) => (
      <ImgsSlide key={i} {...props} imgs={[toImmutable.get(i)]} />
    ));
  }
  let dependent_slides = [];
  if (
    dependent_imgs.length > n_img_per_slide ||
    (independent_imgs.length && dependent_imgs.length)
  ) {
    let j = 0;
    while (dependent_imgs.length > j) {
      dependent_slides.push(
        <ImgsSlide
          key={j}
          {...props}
          imgs={dependent_imgs
            .slice(j, j + n_img_per_slide)
            .map((i) => toImmutable.get(i))}
        />,
      );
      j += n_img_per_slide;
    }
  }

  let candidates =
    !independent_imgs.length &&
    dependent_imgs.length <= n_img_per_slide &&
    dependent_imgs.length > 0
      ? dependent_imgs
      : !dependent_imgs.length && independent_imgs.length === 1
      ? independent_imgs
      : undefined;
  let computed_styles;
  if (candidates) {
    const arranged_imgs = rearrange_imgs(candidates);
    const limit_size = {
      width: side_mode ? slide_size.width / 2 : slide_size.width - lr_padding,
      height: slide_size.height - title_height - padding_bottom,
    };
    let ratio = 1;
    if (
      arranged_imgs.w > arranged_imgs.h &&
      (limit_size.width / arranged_imgs.w) * arranged_imgs.h <=
        limit_size.height
    ) {
      ratio = limit_size.width / arranged_imgs.w;
    } else {
      ratio = limit_size.height / arranged_imgs.h;
    }
    const new_size = {
      width: arranged_imgs.w * ratio,
      height: arranged_imgs.h * ratio,
    };
    arranged_imgs.imgs.forEach((i) => {
      i.size.width *= ratio;
      i.size.height *= ratio;
      i.offset.x *= ratio;
      i.offset.y *= ratio;
      i.offset.y += title_height + (limit_size.height - new_size.height) / 2;
      i.offset.x += side_mode
        ? slide_size.width / 2 / 2 - new_size.width / 2
        : slide_size.width / 2 - new_size.width / 2;
    });
    computed_styles = arranged_imgs.imgs.map((i) => ({
      id: i.id,
      src: i.src,
      style: {
        width: i.size.width,
        height: i.size.height,
        left: i.offset.x,
        top: i.offset.y,
      },
    }));
  }

  let text_size;
  let font_size = 30;
  if (side_mode) {
    do {
      text_size = compute_text_size(original_title, {
        max_width: slide_size.width / 2 - lr_padding,
        style: `font-size: ${font_size}pt;letter-spacing: ${letter_spacing}pt;`,
      });
      font_size -= 2;
    } while (text_size.height > slide_size.height - title_height);
    font_size += 2;
  }
  return (
    <React.Fragment>
      {independent_slides}
      {dependent_slides}
      {computed_styles ? (
        <BasicSlide width={props.width} template_name={props.template_name}>
          <SlideTitle
            title={
              force_side_mode && props.parent ? props.parent.get('name') : title
            }
            color={
              force_side_mode && props.parent && props.parent.get('important')
                ? important_color
                : color
            }
          />
          {computed_styles.map((i) => (
            <img
              className={styles.slideImg}
              src={i.src}
              key={i.id}
              style={i.style}
            />
          ))}
          {side_mode ? (
            <div
              className={styles.slideItem}
              style={{
                top:
                  title_height +
                  (slide_size.height - title_height) / 2 -
                  text_size.height / 2,
                left:
                  slide_size.width / 2 +
                  lr_padding / 2 +
                  (slide_size.width / 2 - text_size.width - lr_padding) / 2,
                width: text_size.width,
                height: text_size.height,
                fontSize: `${font_size}pt`,
              }}
            >
              {original_title}
            </div>
          ) : null}
        </BasicSlide>
      ) : null}
    </React.Fragment>
  );
};

const SlideTitle = (props) => (
  <div
    className={styles.slideTitle}
    style={(() => {
      let font_size = props.firstSlide ? 60 : 44;
      let text_size = compute_text_size(props.title, {
        max_width: slide_size.width - lr_padding * 2,
        style: `font-size: ${font_size}pt;line-height:${font_size}pt;letter-spacing: ${letter_spacing}pt;`,
      });
      return {
        fontSize: `${font_size}pt`,
        lineHeight: `${font_size}pt`,
        color: props.color || 'black',
        left: props.firstSlide
          ? (slide_size.width - text_size.width) / 2
          : lr_padding,
        top: props.firstSlide
          ? (slide_size.height - text_size.height) / 2
          : (title_height - text_size.height) / 2,
        width: slide_size.width - lr_padding * 2,
      };
    })()}
  >
    {props.title}
  </div>
);

const Slide = (props) => {
  const { width, data, parent } = props;

  const validTitle =
    data.get('name').length < MAX_TITLE_TEXT_LENGTH
      ? data.get('name')
      : props.validTitle;
  return (
    <React.Fragment>
      <ImgsSlide
        template_name={props.template_name}
        validTitle={validTitle}
        parent={parent}
        imgs={data.get('imgs')}
        data={data}
        width={width}
      />
      <ItemsSlide
        validTitle={validTitle}
        template_name={props.template_name}
        parent={parent}
        data={data}
        width={width}
      />
    </React.Fragment>
  );
};

const ItemsSlide = (props) => {
  const { parent, data } = props;
  const items = data.get('children');
  const color = data.get('important') ? important_color : nonimportant_color;
  const title = props.validTitle;
  const merge = data.get('merge');
  const prefix = '▪ ';
  const font_size = 28;
  const indent = 40;
  const get_item_list = (props) => {
    const do_get_item_list = (props) => {
      const res = [];
      for (let k = 0, y = props.offset_y; k < props.items.length; ++k) {
        const i = props.items[k];
        const text = prefix + i.name;
        const text_size = compute_text_size(text, {
          max_width: slide_size.width - lr_padding * 2 - props.depth * indent,
          style: `font-size: ${props.font_size}pt;letter-spacing: ${letter_spacing}pt;`,
        });
        const depth = props.depth;
        const o = y;

        const children =
          props.tree && i.children && i.children.length
            ? do_get_item_list({
                offset_y: o + text_size.height,
                offset_x: lr_padding + props.depth * indent,
                offset_y2: 0,
                items: i.children,
                font_size: props.font_size,
                tree: props.tree,
                depth: props.depth + 1,
              })
            : [];
        const y2 = children.reduce(
          (m, x) => Math.max(m, x.offset_y2),
          o + title_height + text_size.height,
        );
        y = y2 - title_height;
        res.push({
          offset_y: o + title_height,
          offset_x: lr_padding + depth * indent,
          offset_y2: y2,
          font_size: props.font_size,
          color: i.important ? important_color : nonimportant_color,
          id: i.id,
          text,
          text_size,
          tree: props.tree,
          children,
        });
      }
      return res;
    };
    let res;
    while (true) {
      res = [
        do_get_item_list({
          ...props,
          offset_x: 0,
          offset_y: 0,
        }),
      ];
      if (props.depth === 0) {
        if (res[0][res[0].length - 1].offset_y2 > slide_size.height) {
          if (props.items.length === 1) {
            // 无法分片，不断缩小字体直到一页幻灯片能容纳
            if (props.font_size > 10) {
              props.font_size -= 2;
              continue;
            } else {
              break;
            }
          } else {
            // 分片
            const n = Math.floor(props.items.length / 2);
            return [
              get_item_list({
                items: props.items.slice(0, n),
                depth: 0,
                font_size,
                tree: merge,
                offset_x: 0,
                offset_y: 0,
              }),
              get_item_list({
                items: props.items.slice(n, props.items.length),
                depth: 0,
                font_size,
                tree: merge,
                offset_x: 0,
                offset_y: 0,
              }),
            ].flat();
          }
        }
      }
      break;
    }
    return res;
  };
  const item_list_data = items.size
    ? get_item_list({
        offset_x: 0,
        offset_y: 0,
        items: items.toJS(),
        depth: 0,
        font_size,
        tree: merge,
      })
    : [];

  const ItemList = (props) =>
    props.items.map((i) => (
      <React.Fragment key={i.id}>
        <div
          className={styles.slideItem}
          style={{
            fontSize: `${i.font_size}pt`,
            top: i.offset_y,
            color: i.color,
            left: i.offset_x,
            width: i.text_size.width,
            height: i.text_size.height,
          }}
        >
          {i.text}
        </div>
        {i.tree ? <ItemList key={i} items={i.children} tree={true} /> : null}
      </React.Fragment>
    ));

  function find_imgs(items, parent = undefined, res = []) {
    for (let i = 0; i < items.size; ++i) {
      const j = items.get(i);
      if (j.get('imgs').size) {
        res.push(
          <ImgsSlide
            validTitle={props.validTitle}
            template_name={props.template_name}
            imgs={j.get('imgs')}
            parent={parent}
            data={j}
            key={j.get('id')}
            width={props.width}
          />,
        );
      }
      if (j.get('children').size) {
        find_imgs(j.get('children'), j, res);
      }
    }
    return res;
  }

  return (
    <React.Fragment>
      {items.size && !(items.size === 1 && items.getIn([0, 'imgs']).size)
        ? item_list_data.map((i) => (
            <BasicSlide key={i.reduce((m, j) => m + j.id, '')} width={props.width} template_name={props.template_name}>
              <SlideTitle title={title} color={color} />
              <ItemList items={i} tree={merge} />
            </BasicSlide>
          ))
        : null}
      {items.size && merge
        ? find_imgs(items, props.data)
        : items.map((i) => (
            <Slide
              validTitle={props.validTitle}
              template_name={props.template_name}
              data={i}
              parent={props.data}
              key={i.get('id')}
              width={props.width}
            />
          ))}
    </React.Fragment>
  );
};

export const SlideView = (props) => {
  const template_list = Object.keys(template);
  const [template_name, set_template_name] = useState(template_list[0]);

  const data = props.data;
  const margin = 16;
  const width = props.width - margin * 2;

  return (
    <div className={styles.slideView} style={{ width: props.width }}>
      <div
        style={{
          display: 'flex',
          marginTop: '10px',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            textAlign: 'left',
            width: '30px',
            paddingLeft: '10px',
          }}
        >
          模板
        </div>
        <select
          value={template_name}
          onChange={(e) => {
            set_template_name(e.target.value);
          }}
        >
          {template_list.map((i) => (
            <option value={i} key={i}>{i}</option>
          ))}
        </select>
      </div>
      <BasicSlide width={width} template_name={template_name} firstSlide>
        <SlideTitle
          title={data.get('name')}
          firstSlide
          color={data.get('important') ? important_color : nonimportant_color}
        />
      </BasicSlide>
      <Slide
        validTitle={data.get('name')}
        template_name={template_name}
        data={data}
        width={width}
        key={data.get('id')}
      />
    </div>
  );
};
