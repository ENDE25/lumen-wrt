import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { MOCK } from './lib/ubus';

if (MOCK) document.title = 'Lumen demo';

export default mount(App, { target: document.getElementById('app')! });
