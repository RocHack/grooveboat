module.exports = {
	template: [],

	handler: function() {},

	init: function() {
		this.observe(this.observers);

		var updatePath = this.updatePath.bind(this);
		window.addEventListener("popstate", updatePath, false);
		this.on('teardown', function() {
			window.removeEventListener("popstate", updatePath);
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

	navigate: function(path) {
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
