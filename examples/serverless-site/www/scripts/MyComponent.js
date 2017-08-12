import React from 'react';
import './MyComponent.scss';


const MyComponent = () => (
  <div>
    <h1>OK</h1>
    <img src={require('images/aws_logo.png')}/>
    <div className="bg"/>
  </div>
);

export default MyComponent;
