module.exports = {
	template: [],

	handler: function() {},

	init: function() {
		this.observe(this.observers);

		var updatePath = this.updatePath.bind(this);
		var onClick = this.onClick.bind(this);
		window.addEventListener('popstate', updatePath, false);
		window.addEventListener('click', onClick, false);
		this.on('teardown', function() {
			window.removeEventListener('popstate', updatePath, false);
			window.removeEventListener('click', onClick, false);
		});
	},

	observers: {
		page: function(newPage, oldPage) {
			if (oldPage) oldPage.teardown();
			if (newPage) newPage.insert(this.el);
		},
		path: function(path) {
			var page;
			try {
				page = this.handler(path);
			} catch(e) {
				console.error(e.stack || e);
			}
			this.set('page', page);
		}
	},

	updatePath: function() {
		this.set('path', location.pathname);
	},

	onClick: function(e) {
		if (e.target.nodeName == 'A' && !e.ctrlKey && e.target.href &&
			e.target.href.indexOf(location.origin) === 0) {
			// intercept the click
			e.preventDefault();
			this.navigate(e.target.href.substr(location.origin.length));
		}
	},

	navigate: function(path) {
		if (!path) path = '/';
		this.set('path', path);
		var page = this.get('page');
		var state = true;
		var title = page ? page.title || page.get('title') : window.title;
		window.history.pushState(state, title, path);
	},

	setHandler: function(handler) {
		this.handler = handler;
		this.updatePath();
	}
};
