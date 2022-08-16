import React, { Component } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

class MindExportEditor extends Component<
  { value: string; onChange: Function },
  { value: string }
> {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value,
    };
  }

  render() {
    return (
      <CKEditor
        editor={ClassicEditor}
        config={{
          toolbar: ['bulletedList'],
        }}
        onChange={(event, editor) => {
          const value = editor.getData();
          this.setState({ value });
          this.props.onChange(value);
        }}
        data={this.state.value}
      />
    );
  }
}
export default MindExportEditor;
