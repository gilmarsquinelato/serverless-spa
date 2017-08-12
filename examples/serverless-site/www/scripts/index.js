import React from 'react';
import { render } from 'react-dom';
import { AppContainer } from 'react-hot-loader';
import MyComponent from './MyComponent';


function renderComponent(Component) {
  render((
    <AppContainer>
      <Component />
    </AppContainer>),
    document.getElementById('app'));
}
renderComponent(MyComponent);

if(module.hot) {
  module.hot.accept('./MyComponent.js', () => {
    renderComponent(require('./MyComponent').default);
  });
}
