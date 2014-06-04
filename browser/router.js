module.exports = {
	template: [],

	init: function(options) {
		this.handler = options.handler;
		this.observe(this.observers);
		this.updatePath();

		var updatePath = this.updatePath.bind(this);
		window.addEventListener("popstate", updatePath, false);
		this.on('teardown', function() {
			window.removeEventListener("popstate", updatePath);
		});
	},

	observers: {
		page: function(newPage, oldPage) {
			if (oldPage) { console.log('teardown'); oldPage.teardown();}
			if (newPage) newPage.insert(this.el);
		},
		path: function(path) {
			var page;
			try {
				page = this.handler(path);
			} catch(e) {
				console.error(e);
			}
			this.set('page', page);
		}
	},

	updatePath: function() {
		this.set('path', location.pathname);
	},

	navigate: function(path) {
		var state = true;
		var title = window.title;
		window.history.pushState(state, title, path);
		this.set('path', path);
	}
};
