(window.webpackJsonp=window.webpackJsonp||[]).push([[6],{253:function(t,e,a){"use strict";a.r(e);var n=a(0),s=a.n(n),o=a(118),r=a(119),i=a.n(r);class u extends n.Component{constructor(t){super(t),this.state={value:t.value}}render(){return s.a.createElement(o.CKEditor,{editor:i.a,config:{toolbar:["bulletedList"]},onChange:(t,e)=>{const a=e.getData();this.setState({value:a}),this.props.onChange(a)},data:this.state.value})}}e.default=u}}]);